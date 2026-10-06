import { expect } from 'chai';
import { default as sinon } from 'ts-sinon';
import { Struct } from 'google-protobuf/google/protobuf/struct_pb';
import { Step as ProtoStep, StepDefinition, FieldDefinition, RunStepResponse } from '../../../src/proto/cog_pb';
import { PostmasterMetricPeriodEquals as StepUnderTest } from '../../../src/steps/postmaster/postmaster-metric-period-equals';

describe('PostmasterMetricPeriodEquals', () => {
  let protoStep: ProtoStep;
  let stepUnderTest: StepUnderTest;
  let clientWrapperStub: any;

  beforeEach(() => {
    protoStep = new ProtoStep();
    clientWrapperStub = sinon.stub();
    clientWrapperStub.queryPostmasterMetric = sinon.stub();
    stepUnderTest = new StepUnderTest(clientWrapperStub);
  });

  afterEach(() => {
    sinon.restore();
  });

  it('publishes the step metadata', () => {
    const definition: StepDefinition = stepUnderTest.getDefinition();
    expect(definition.getStepId()).to.equal('PostmasterMetricPeriodEquals');
    expect(definition.getName()).to.equal('Check a Google Postmaster metric for a period');
    expect(definition.getType()).to.equal(StepDefinition.Type.VALIDATION);
    const fields = definition.getExpectedFieldsList();
    expect(fields.map((field) => field.getKey())).to.deep.equal(['domain', 'metric', 'from', 'to', 'operator', 'expectation']);
    fields.forEach((field) => {
      expect(field.getOptionality()).to.equal(FieldDefinition.Optionality.REQUIRED);
      expect(field.getType()).to.equal(FieldDefinition.Type.STRING);
    });
  });

  it('fails when Google\'s period spam rate is above 0.10%', async () => {
    protoStep.setData(Struct.fromJavaScript({
      domain: 'www.stackmoxie.com',
      metric: 'spam rate',
      from: '2026-09-28',
      to: '2026-10-04',
      operator: 'below',
      expectation: '0.10%',
    }));
    clientWrapperStub.queryPostmasterMetric.resolves([{ date: null, value: 0.0018 }]);
    const response: RunStepResponse = await stepUnderTest.executeStep(protoStep);
    expect(clientWrapperStub.queryPostmasterMetric.firstCall.args[4]).to.equal('OVERALL');
    expect(response.getOutcome()).to.equal(RunStepResponse.Outcome.FAILED);
    expect(response.getMessageFormat()).to.contain('Spam complaints for this period are above the recommended level');
    expect(response.getMessageFormat()).to.contain('0.18%');
    expect(response.getMessageFormat()).to.not.contain('average');
  });

  it('passes when Google has no data for the period', async () => {
    protoStep.setData(Struct.fromJavaScript({
      domain: 'www.stackmoxie.com',
      metric: 'spam rate',
      from: '2026-09-28',
      to: '2026-10-04',
      operator: 'below',
      expectation: '0.10%',
    }));
    clientWrapperStub.queryPostmasterMetric.resolves([]);
    const response: RunStepResponse = await stepUnderTest.executeStep(protoStep);
    expect(response.getOutcome()).to.equal(RunStepResponse.Outcome.PASSED);
    expect(response.getMessageFormat()).to.contain('No spam-rate issue detected');
  });

  it('errors when the client throws', async () => {
    protoStep.setData(Struct.fromJavaScript({
      domain: 'www.stackmoxie.com',
      metric: 'spam rate',
      from: '2026-09-28',
      to: '2026-10-04',
      operator: 'below',
      expectation: '0.10%',
    }));
    clientWrapperStub.queryPostmasterMetric.rejects(new Error('socket hang up'));
    const response: RunStepResponse = await stepUnderTest.executeStep(protoStep);
    expect(response.getOutcome()).to.equal(RunStepResponse.Outcome.ERROR);
  });
});
