import { expect } from 'chai';
import { default as sinon } from 'ts-sinon';
import { Struct } from 'google-protobuf/google/protobuf/struct_pb';
import { Step as ProtoStep, StepDefinition, FieldDefinition, RunStepResponse } from '../../../src/proto/cog_pb';
import { PostmasterMetricEquals as StepUnderTest } from '../../../src/steps/postmaster/postmaster-metric-equals';
import { PostmasterMonitorError, isoDaysAgo } from '../../../src/client/postmaster-v2';

describe('PostmasterMetricEquals', () => {
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
    expect(definition.getStepId()).to.equal('PostmasterMetricEquals');
    expect(definition.getName()).to.equal('Check a Google Postmaster metric');
    expect(definition.getType()).to.equal(StepDefinition.Type.VALIDATION);
    const fields = definition.getExpectedFieldsList();
    expect(fields.map((field) => field.getKey())).to.deep.equal(['domain', 'metric', 'date', 'operator', 'expectation']);
    fields.forEach((field) => {
      expect(field.getOptionality()).to.equal(FieldDefinition.Optionality.REQUIRED);
      expect(field.getType()).to.equal(FieldDefinition.Type.STRING);
    });
  });

  it('passes a spam rate under 0.10% and asks Google for the domain', async () => {
    protoStep.setData(Struct.fromJavaScript({
      domain: 'www.stackmoxie.com',
      metric: 'spam rate',
      operator: 'below',
      expectation: '0.10%',
      date: 'the latest day with data',
    }));
    clientWrapperStub.queryPostmasterMetric.resolves([{ date: isoDaysAgo(2), value: 0.0004 }]);
    const response: RunStepResponse = await stepUnderTest.executeStep(protoStep);
    expect(clientWrapperStub.queryPostmasterMetric.firstCall.args[0]).to.equal('www.stackmoxie.com');
    expect(clientWrapperStub.queryPostmasterMetric.firstCall.args[1]).to.equal('spam rate');
    expect(response.getOutcome()).to.equal(RunStepResponse.Outcome.PASSED);
    expect(response.getMessageFormat()).to.contain('Your Gmail spam rate is 0.04%, below the 0.10% threshold.');
  });

  it('treats a bare 0.10 as 0.10% and fails above that threshold', async () => {
    protoStep.setData(Struct.fromJavaScript({
      domain: 'www.stackmoxie.com',
      metric: 'spam rate',
      operator: 'below',
      expectation: '0.10',
      date: isoDaysAgo(2),
    }));
    clientWrapperStub.queryPostmasterMetric.resolves([{ date: isoDaysAgo(2), value: 0.0024 }]);
    const response: RunStepResponse = await stepUnderTest.executeStep(protoStep);
    expect(response.getOutcome()).to.equal(RunStepResponse.Outcome.FAILED);
    expect(response.getMessageFormat()).to.contain('Spam complaints are above the recommended level');
    expect(response.getMessageFormat()).to.contain('0.24%');
    expect(response.getMessageFormat()).to.contain('What to check');
    expect(response.getMessageFormat()).to.contain('Technical detail:');
  });

  it('passes when Google has no spam-rate data', async () => {
    protoStep.setData(Struct.fromJavaScript({
      domain: 'www.stackmoxie.com',
      metric: 'spam rate',
      operator: 'below',
      expectation: '0.10%',
      date: 'the latest day with data',
    }));
    clientWrapperStub.queryPostmasterMetric.resolves([]);
    const response: RunStepResponse = await stepUnderTest.executeStep(protoStep);
    expect(response.getOutcome()).to.equal(RunStepResponse.Outcome.PASSED);
    expect(response.getMessageFormat()).to.contain('No spam-rate issue detected');
  });

  it('uses the newest day and notes when that day is stale', async () => {
    protoStep.setData(Struct.fromJavaScript({
      domain: 'www.stackmoxie.com',
      metric: 'spam rate',
      operator: 'below',
      expectation: '0.10%',
      date: 'the latest day with data',
    }));
    clientWrapperStub.queryPostmasterMetric.resolves([
      { date: isoDaysAgo(12), value: 0.002 },
      { date: isoDaysAgo(9), value: 0.0002 },
    ]);
    const response: RunStepResponse = await stepUnderTest.executeStep(protoStep);
    expect(response.getOutcome()).to.equal(RunStepResponse.Outcome.PASSED);
    expect(response.getMessageFormat()).to.contain('0.02%');
    expect(response.getMessageFormat()).to.contain('9 days old');
  });

  it('errors when the Google connection must be updated', async () => {
    protoStep.setData(Struct.fromJavaScript({
      domain: 'www.stackmoxie.com',
      metric: 'spam rate',
      operator: 'below',
      expectation: '0.10%',
      date: 'the latest day with data',
    }));
    clientWrapperStub.queryPostmasterMetric.rejects(new PostmasterMonitorError('reconnect', 'invalid_grant'));
    const response: RunStepResponse = await stepUnderTest.executeStep(protoStep);
    expect(response.getOutcome()).to.equal(RunStepResponse.Outcome.ERROR);
    expect(response.getMessageFormat()).to.contain('Reconnect Google Postmaster');
  });

  it('errors when the operator is unknown', async () => {
    protoStep.setData(Struct.fromJavaScript({
      domain: 'www.stackmoxie.com',
      metric: 'spam rate',
      operator: 'sideways',
      expectation: '0.10%',
      date: isoDaysAgo(1),
    }));
    clientWrapperStub.queryPostmasterMetric.resolves([{ date: isoDaysAgo(1), value: 0.0001 }]);
    const response: RunStepResponse = await stepUnderTest.executeStep(protoStep);
    expect(response.getOutcome()).to.equal(RunStepResponse.Outcome.ERROR);
  });
});
