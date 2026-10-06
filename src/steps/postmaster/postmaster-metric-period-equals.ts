import { BaseStep, Field, StepInterface } from '../../core/base-step';
import { Step, FieldDefinition, StepDefinition } from '../../proto/cog_pb';
import {
  METRIC_EXPRESSION,
  POSTMASTER_METRICS,
  PostmasterMonitorError,
  assertOperator,
  formatLongDate,
  formatPercent,
  monitorMessage,
  parsePercent,
} from '../../client/postmaster-v2';

function formatRange(from: string, to: string): string {
  const fromLong = formatLongDate(from);
  const toLong = formatLongDate(to);
  if (from.slice(0, 4) === to.slice(0, 4)) {
    return `${fromLong.replace(`, ${from.slice(0, 4)}`, '')}–${toLong}`;
  }
  return `${fromLong}–${toLong}`;
}

export class PostmasterMetricPeriodEquals extends BaseStep implements StepInterface {
  protected stepName = 'Check a Google Postmaster metric for a period';

  protected stepExpression = `the Google Postmaster (?<metric>${METRIC_EXPRESSION}) for (?<domain>[a-zA-Z0-9_.-]+) from (?<from>\\d{4}-\\d{2}-\\d{2}) to (?<to>\\d{4}-\\d{2}-\\d{2}) should be (?<operator>below|above|exactly) (?<expectation>\\d+(?:\\.\\d+)?%?)`;

  protected stepType = StepDefinition.Type.VALIDATION;

  protected actionList: string[] = ['check'];

  protected targetObject = 'PostmasterMetricPeriod';

  protected stepHelp = 'Uses the value Google returns for the dates you choose. Stack Moxie does not calculate an average.';

  protected expectedFields: Field[] = [{
    field: 'domain',
    type: FieldDefinition.Type.STRING,
    description: 'Domain',
  }, {
    field: 'metric',
    type: FieldDefinition.Type.STRING,
    description: 'Metric',
  }, {
    field: 'from',
    type: FieldDefinition.Type.STRING,
    description: 'From',
  }, {
    field: 'to',
    type: FieldDefinition.Type.STRING,
    description: 'To',
  }, {
    field: 'operator',
    type: FieldDefinition.Type.STRING,
    description: 'Should be',
  }, {
    field: 'expectation',
    type: FieldDefinition.Type.STRING,
    description: 'Expected',
    help: 'A percentage, such as 0.10%.',
  }];

  async executeStep(step: Step) {
    const stepData: any = step.getData() ? step.getData().toJavaScript() : {};
    const {
      domain, metric, operator, expectation, from, to,
    } = stepData;
    const definition = POSTMASTER_METRICS[metric];
    if (!domain || !definition || !from || !to) {
      return this.error(monitorMessage('config', domain || 'this domain'));
    }
    try {
      const expectedRatio = parsePercent(expectation);
      const points = await this.client.queryPostmasterMetric(domain, metric, from, to, 'OVERALL');
      if (!points || !points.length) {
        return this.pass(`${definition.noDataTitle}\n\nGoogle Postmaster has no ${metric} data for ${domain} from ${formatRange(from, to)}. No action is needed.`);
      }
      const actual = points[0].value;
      const result = this.assert(assertOperator(operator), actual, expectedRatio, metric);
      const actualPct = formatPercent(actual);
      const expectedPct = formatPercent(expectedRatio);
      const range = formatRange(from, to);
      const records = [this.keyValue('PostmasterMetricPeriod', `${definition.label} for ${domain}`, {
        Domain: domain,
        [definition.label]: actualPct,
        Expected: `${operator} ${expectedPct}`,
        Period: range,
      })];
      const technical = `Technical detail: ${result.message}`;
      const checked = `Checked ${domain} for ${range}.`;
      if (result.valid) {
        const lead = metric === 'spam rate'
          ? `Google's spam rate for ${range} is ${actualPct}, which is ${operator} ${expectedPct}.`
          : `Google's ${definition.headline.toLowerCase()} for ${range} is ${actualPct}, which is ${operator} ${expectedPct}.`;
        return this.pass(`${lead}\n\n${checked}\n\n${technical}`, [], records);
      }
      const lead = metric === 'spam rate' && operator === 'below'
        ? `Spam complaints for this period are above the recommended level.\n\nGoogle's spam rate for ${range} is ${actualPct}, above the ${expectedPct} threshold. ${definition.why}`
        : `Google's ${definition.headline.toLowerCase()} for ${range} is ${actualPct}, which is not ${operator} ${expectedPct}. ${definition.why}`;
      return this.fail(`${lead}\n\n${checked}\n\nWhat to check\n${definition.whatToCheck}\n\n${technical}`, [], records);
    } catch (error) {
      if (error instanceof PostmasterMonitorError) {
        return this.error(monitorMessage(error.kind, domain));
      }
      return this.error(`Stack Moxie could not check ${domain}. ${error.message}`);
    }
  }
}

export { PostmasterMetricPeriodEquals as Step };
