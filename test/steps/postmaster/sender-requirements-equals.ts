import { expect } from 'chai';
import { default as sinon } from 'ts-sinon';
import { Struct } from 'google-protobuf/google/protobuf/struct_pb';
import { Step as ProtoStep, StepDefinition, FieldDefinition, RunStepResponse } from '../../../src/proto/cog_pb';
import { SenderRequirementsEquals as StepUnderTest } from '../../../src/steps/postmaster/sender-requirements-equals';
import { PostmasterMonitorError } from '../../../src/client/postmaster-v2';

describe('SenderRequirementsEquals', () => {
  let protoStep: ProtoStep;
  let stepUnderTest: StepUnderTest;
  let clientWrapperStub: any;

  beforeEach(() => {
    protoStep = new ProtoStep();
    clientWrapperStub = sinon.stub();
    clientWrapperStub.getPostmasterCompliance = sinon.stub();
    stepUnderTest = new StepUnderTest(clientWrapperStub);
  });

  afterEach(() => {
    sinon.restore();
  });

  it('publishes the step metadata', () => {
    const definition: StepDefinition = stepUnderTest.getDefinition();
    expect(definition.getStepId()).to.equal('SenderRequirementsEquals');
    expect(definition.getName()).to.equal('Check Google Postmaster sender requirements');
    expect(definition.getType()).to.equal(StepDefinition.Type.VALIDATION);
    expect(definition.getExpression()).to.contain('Google Postmaster sender requirements');
    const fields = definition.getExpectedFieldsList();
    expect(fields.map((field) => field.getKey())).to.deep.equal(['domain', 'expectation']);
    fields.forEach((field) => {
      expect(field.getOptionality()).to.equal(FieldDefinition.Optionality.REQUIRED);
      expect(field.getType()).to.equal(FieldDefinition.Type.STRING);
    });
  });

  it('passes when Google says the domain is compliant', async () => {
    protoStep.setData(Struct.fromJavaScript({ domain: 'www.stackmoxie.com', expectation: 'compliant' }));
    clientWrapperStub.getPostmasterCompliance.resolves({ status: 'COMPLIANT', needsWork: [] });
    const response: RunStepResponse = await stepUnderTest.executeStep(protoStep);
    expect(clientWrapperStub.getPostmasterCompliance).to.have.been.calledWith('www.stackmoxie.com');
    expect(response.getOutcome()).to.equal(RunStepResponse.Outcome.PASSED);
    expect(response.getMessageFormat()).to.contain("meeting Google's Gmail sender requirements");
  });

  it('fails and names the requirements that need work', async () => {
    protoStep.setData(Struct.fromJavaScript({ domain: 'www.stackmoxie.com', expectation: 'compliant' }));
    clientWrapperStub.getPostmasterCompliance.resolves({
      status: 'NEEDS_WORK',
      needsWork: ['One-click unsubscribe', 'Spam rate'],
    });
    const response: RunStepResponse = await stepUnderTest.executeStep(protoStep);
    expect(response.getOutcome()).to.equal(RunStepResponse.Outcome.FAILED);
    expect(response.getMessageFormat()).to.contain('Some Gmail sender requirements need attention');
    expect(response.getMessageFormat()).to.contain('One-click unsubscribe — Needs work');
    expect(response.getMessageFormat()).to.contain('What to check');
  });

  it('passes when Google returns no verdict', async () => {
    protoStep.setData(Struct.fromJavaScript({ domain: 'www.stackmoxie.com', expectation: 'compliant' }));
    clientWrapperStub.getPostmasterCompliance.resolves({ status: null, needsWork: [] });
    const response: RunStepResponse = await stepUnderTest.executeStep(protoStep);
    expect(response.getOutcome()).to.equal(RunStepResponse.Outcome.PASSED);
    expect(response.getMessageFormat()).to.contain('No compliance issue reported');
  });

  it('errors when the Google connection must be updated', async () => {
    protoStep.setData(Struct.fromJavaScript({ domain: 'www.stackmoxie.com', expectation: 'compliant' }));
    clientWrapperStub.getPostmasterCompliance.rejects(new PostmasterMonitorError('reconnect', 'invalid_grant'));
    const response: RunStepResponse = await stepUnderTest.executeStep(protoStep);
    expect(response.getOutcome()).to.equal(RunStepResponse.Outcome.ERROR);
    expect(response.getMessageFormat()).to.contain('Reconnect Google Postmaster');
  });
});
