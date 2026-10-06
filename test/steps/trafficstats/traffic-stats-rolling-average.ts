import { expect } from 'chai';
import { default as sinon } from 'ts-sinon';
import { Struct } from 'google-protobuf/google/protobuf/struct_pb';
import { Step as ProtoStep, RunStepResponse } from '../../../src/proto/cog_pb';
import { TrafficStatsRollingAverage as StepUnderTest } from '../../../src/steps/trafficstats/traffic-stats-rolling-average';

describe('TrafficStatsRollingAverage', () => {
  let protoStep: ProtoStep;
  let stepUnderTest: StepUnderTest;
  let clientWrapperStub: any;

  beforeEach(() => {
    protoStep = new ProtoStep();
    clientWrapperStub = sinon.stub();
    clientWrapperStub.getRollingAverageForField = sinon.stub();
    stepUnderTest = new StepUnderTest(clientWrapperStub);
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('ExecuteStep', () => {
    const domain = 'example.com';
    const field = 'deliveryErrors';
    const operator = 'be';
    const expectation = 5;
    const failingRollingAverage = 4;
    const passingRollingAverage = 5;

    describe('Successful Validation', () => {
      beforeEach(() => {
        protoStep.setData(Struct.fromJavaScript({ domain, field, operator, expectation }));
        clientWrapperStub.getRollingAverageForField.resolves(passingRollingAverage);
      });

      it('should respond with pass when the rolling average meets expectation', async () => {
        const response: RunStepResponse = await stepUnderTest.executeStep(protoStep);
        expect(response.getOutcome()).to.equal(RunStepResponse.Outcome.PASSED);
      });
    });

    describe('Failed Validation', () => {
      beforeEach(() => {
        protoStep.setData(Struct.fromJavaScript({ domain, field, operator: 'be greater than', expectation }));
        clientWrapperStub.getRollingAverageForField.resolves(failingRollingAverage);
      });

      it('should respond with fail when the rolling average does not meet expectation', async () => {
        const response: RunStepResponse = await stepUnderTest.executeStep(protoStep);
        expect(response.getOutcome()).to.equal(RunStepResponse.Outcome.FAILED);
      });
    });

    describe('Error Handling', () => {
      beforeEach(() => {
        protoStep.setData(Struct.fromJavaScript({ domain, field, operator, expectation }));
        clientWrapperStub.getRollingAverageForField.rejects(new Error('Error fetching rolling average'));
      });

      it('should respond with error on client error', async () => {
        const response: RunStepResponse = await stepUnderTest.executeStep(protoStep);
        expect(response.getOutcome()).to.equal(RunStepResponse.Outcome.ERROR);
        expect(response.getMessageFormat()).to.include('There was an error checking the rolling average for the traffic stats field');
      });
    });
  });
});
