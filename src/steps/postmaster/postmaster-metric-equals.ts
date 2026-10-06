import { BaseStep, Field, StepInterface } from '../../core/base-step';
import { Step, FieldDefinition, StepDefinition } from '../../proto/cog_pb';
import {
  METRIC_EXPRESSION,
  POSTMASTER_METRICS,
  PostmasterMonitorError,
  ageInDays,
  assertOperator,
  formatLongDate,
  formatPercent,
  isoDaysAgo,
  monitorMessage,
  parsePercent,
} from '../../client/postmaster-v2';

export class PostmasterMetricEquals extends BaseStep implements StepInterface {
  protected stepName = 'Check a Google Postmaster metric';

  protected stepExpression = `the Google Postmaster (?<metric>${METRIC_EXPRESSION}) for (?<domain>[a-zA-Z0-9_.-]+) should be (?<operator>below|above|exactly) (?<expectation>\\d+(?:\\.\\d+)?%?) on (?<date>the latest day with data|\\d{4}-\\d{2}-\\d{2})`;

  protected stepType = StepDefinition.Type.VALIDATION;

  protected actionList: string[] = ['check'];

  protected targetObject = 'PostmasterMetric';

  protected stepHelp = 'Rates are entered as percentages, such as 0.10%. Spam rate is the percentage of Gmail messages recipients reported as spam. A low reported rate does not necessarily mean every message reached the inbox.';

  protected expectedFields: Field[] = [{
    field: 'domain',
    type: FieldDefinition.Type.STRING,
    description: 'Domain',
  }, {
    field: 'metric',
    type: FieldDefinition.Type.STRING,
    description: 'Metric',
  }, {
    field: 'date',
    type: FieldDefinition.Type.STRING,
    description: 'Date',
    help: 'Latest day with data, or a date in YYYY-MM-DD.',
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
      domain, metric, operator, expectation, date,
    } = stepData;
    const definition = POSTMASTER_METRICS[metric];
    if (!domain || !definition) {
      return this.error(monitorMessage('config', domain || 'this domain'));
    }
    try {
      const expectedRatio = parsePercent(expectation);
      const latest = date === 'the latest day with data';
      const end = latest ? isoDaysAgo(0) : date;
      const start = latest ? isoDaysAgo(30) : date;
      const points = await this.client.queryPostmasterMetric(domain, metric, start, end, 'DAILY');
      const dated = (points || []).filter((point) => point.date).sort((left, right) => (left.date < right.date ? 1 : -1));
      if (!dated.length) {
        return this.pass(`${definition.noDataTitle}\n\nGoogle Postmaster has no ${metric} data available for this check. No action is needed.`);
      }
      const point = dated[0];
      const actual = point.value;
      const result = this.assert(assertOperator(operator), actual, expectedRatio, metric);
      const actualPct = formatPercent(actual);
      const expectedPct = formatPercent(expectedRatio);
      const age = ageInDays(point.date);
      const agePhrase = age <= 0 ? 'today' : `${age} day${age === 1 ? '' : 's'} ago`;
      const when = latest
        ? `Checked ${domain} on ${formatLongDate(point.date)} · Latest data available from Google, ${agePhrase}.`
        : `Checked ${domain} on ${formatLongDate(point.date)}.`;
      const stale = latest && age >= 7
        ? `\n\nGoogle's latest available data is ${age} days old. This result may not reflect current sending.`
        : '';
      const records = [this.keyValue('PostmasterMetric', `${definition.label} for ${domain}`, {
        Domain: domain,
        [definition.label]: actualPct,
        Expected: `${operator} ${expectedPct}`,
        'Data from': formatLongDate(point.date),
      })];
      const technical = `Technical detail: ${result.message}`;
      if (result.valid) {
        const lead = metric === 'spam rate' && operator === 'below'
          ? `Your Gmail spam rate is ${actualPct}, below the ${expectedPct} threshold.`
          : `Your ${definition.headline.toLowerCase()} is ${actualPct}, which is ${operator} ${expectedPct}.`;
        return this.pass(`${lead}\n\n${when}${stale}\n\n${technical}`, [], records);
      }
      const lead = metric === 'spam rate' && operator === 'below'
        ? `Spam complaints are above the recommended level.\n\nYour Gmail spam rate is ${actualPct}, above the ${expectedPct} threshold. ${definition.why}`
        : `Your ${definition.headline.toLowerCase()} is ${actualPct}, which is not ${operator} ${expectedPct}. ${definition.why}`;
      return this.fail(`${lead}\n\n${when}${stale}\n\nWhat to check\n${definition.whatToCheck}\n\n${technical}`, [], records);
    } catch (error) {
      if (error instanceof PostmasterMonitorError) {
        return this.error(monitorMessage(error.kind, domain));
      }
      return this.error(`Stack Moxie could not check ${domain}. ${error.message}`);
    }
  }
}

export { PostmasterMetricEquals as Step };
