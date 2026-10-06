import { BaseStep, Field, StepInterface } from '../../core/base-step';
import { Step, FieldDefinition, StepDefinition } from '../../proto/cog_pb';
import { PostmasterMonitorError, monitorMessage } from '../../client/postmaster-v2';

export class SenderRequirementsEquals extends BaseStep implements StepInterface {
  protected stepName = 'Check Google Postmaster sender requirements';

  protected stepExpression = 'the Google Postmaster sender requirements for (?<domain>[a-zA-Z0-9_.-]+) should be (?<expectation>compliant|needing attention)';

  protected stepType = StepDefinition.Type.VALIDATION;

  protected actionList: string[] = ['check'];

  protected targetObject = 'SenderRequirements';

  protected stepHelp = 'Whether Google says this domain meets its sender requirements. Meeting them does not prove every message reached the inbox.';

  protected expectedFields: Field[] = [{
    field: 'domain',
    type: FieldDefinition.Type.STRING,
    description: 'Domain',
    help: 'The domain exactly as it is registered in Google Postmaster Tools.',
  }, {
    field: 'expectation',
    type: FieldDefinition.Type.STRING,
    description: 'Expected',
    help: 'compliant or needing attention.',
  }];

  async executeStep(step: Step) {
    const stepData: any = step.getData() ? step.getData().toJavaScript() : {};
    const { domain, expectation } = stepData;
    try {
      if (!domain) {
        return this.error(monitorMessage('config', 'this domain'));
      }
      const report = await this.client.getPostmasterCompliance(domain);
      if (!report || !report.status) {
        return this.pass(`No compliance issue reported.\n\nGoogle Postmaster did not return a compliance verdict for ${domain}. No action is needed.`);
      }
      const wantsNeedsWork = expectation === 'needing attention';
      const isNeedsWork = report.status === 'NEEDS_WORK';
      const holds = wantsNeedsWork ? isNeedsWork : !isNeedsWork && expectation === 'compliant';
      if (expectation !== 'compliant' && expectation !== 'needing attention') {
        return this.error(`Stack Moxie could not check ${domain}. Expected should be compliant or needing attention.`);
      }
      const records = [this.keyValue('SenderRequirements', `Gmail sender requirements for ${domain}`, {
        Domain: domain,
        'Gmail sender requirements': isNeedsWork ? 'Needs attention' : 'Meeting requirements',
      })];
      if (holds && !isNeedsWork) {
        return this.pass(`Your domain is meeting Google's Gmail sender requirements.\n\nChecked ${domain}.`, [], records);
      }
      if (holds && isNeedsWork) {
        return this.pass(`Google reports that ${domain} needs attention on its sender requirements, as expected.\n\nChecked ${domain}.`, [], records);
      }
      if (!isNeedsWork) {
        return this.fail(`Your domain is meeting Google's Gmail sender requirements.\n\nThe check expected needing attention.\n\nChecked ${domain}.`, [], records);
      }
      const lines = (report.needsWork || []).map((item) => `${item} — Needs work`).join('\n');
      const guidance = lines || 'Google did not name the individual requirements.';
      return this.fail(`Some Gmail sender requirements need attention.\n\nGoogle reports that ${domain} is not currently meeting all sender requirements. Messages that miss Google's sender requirements are more likely to be rejected or placed in spam.\n\nChecked ${domain}.\n\nWhat to check\n${guidance}\n\nTechnical detail: Expected sender requirements to be "${expectation}", but Google reported ${isNeedsWork ? 'needs work' : 'compliant'}.`, [], records);
    } catch (error) {
      if (error instanceof PostmasterMonitorError) {
        return this.error(monitorMessage(error.kind, domain || 'this domain'));
      }
      return this.error(monitorMessage('request', domain || 'this domain'));
    }
  }
}

export { SenderRequirementsEquals as Step };
