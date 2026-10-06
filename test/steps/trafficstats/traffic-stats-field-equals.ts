import { Struct } from 'google-protobuf/google/protobuf/struct_pb';
import { Step as ProtoStep, StepDefinition, FieldDefinition, RunStepResponse } from '../../../src/proto/cog_pb';
import { TrafficStatsFieldEquals as StepUnderTest } from '../../../src/steps/trafficstats/traffic-stats-field-equals';
import { default as sinon } from 'ts-sinon';
import { expect } from 'chai';

describe('TrafficStatsFieldEquals', () => {
  let protoStep: ProtoStep;
  let stepUnderTest: StepUnderTest;
  let clientWrapperStub: any;

  beforeEach(() => {
    protoStep = new ProtoStep();
    clientWrapperStub = sinon.stub();
    clientWrapperStub.getDomainTrafficStatsDate = sinon.stub();
    clientWrapperStub.getRollingAverageForField = sinon.stub();
    clientWrapperStub.getDomainTrafficStatsLastPage = sinon.stub();

    clientWrapperStub.getDomainTrafficStatsDate.resolves({ userReportedSpamRatio: 0.000 });

    stepUnderTest = new StepUnderTest(clientWrapperStub);
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('Metadata', () => {
    it('should return expected step metadata', () => {
      const stepDef: StepDefinition = stepUnderTest.getDefinition();
      expect(stepDef.getStepId()).to.equal('TrafficStatsFieldEquals');
      // Assert metadata like stepId, name, expression
    });
  });

  describe('ExecuteStep with Rolling Average', () => {
    const domain = 'example.com';
    const date = '2023-12-23T00:00:00.000Z';
    const field = 'userReportedSpamRatio';
    const operator = 'be less than';
    const expectation = 0.001;
    const rollingAveragePass = 0.000;
    const rollingAverageFail = 0.0015;

    beforeEach(() => {
      protoStep.setData(Struct.fromJavaScript({ domain, date, field, operator, expectation }));
    });

    it('should include rolling average in the pass response', async () => {
      clientWrapperStub.getRollingAverageForField.resolves(rollingAveragePass);
      clientWrapperStub.getDomainTrafficStatsDate.resolves({ userReportedSpamRatio: 0.000 });
      clientWrapperStub.getDomainTrafficStatsLastPage.resolves({
        trafficStats: [
          { userReportedSpamRatio: 0.000 },
        ],
        nextPageToken: null,
      });
      const response: RunStepResponse = await stepUnderTest.executeStep(protoStep);
      expect(response.getOutcome()).to.equal(RunStepResponse.Outcome.PASSED);
      expect(response.getMessageFormat()).to.include(`The rolling 30-day average for ${field} is ${rollingAveragePass.toFixed(4)}`);
    });

    it('should include rolling average in the fail response', async () => {
      // Setup a failing condition
      clientWrapperStub.getRollingAverageForField.resolves(rollingAverageFail);
      clientWrapperStub.getDomainTrafficStatsDate.resolves({ userReportedSpamRatio: 0.0015 });

      const response: RunStepResponse = await stepUnderTest.executeStep(protoStep);
      expect(response.getOutcome()).to.equal(RunStepResponse.Outcome.FAILED);
      expect(response.getMessageFormat()).to.include(`The rolling 30-day average for ${field} is ${rollingAverageFail.toFixed(4)}`);
    });

    it('should handle errors when fetching rolling average', async () => {
      // Setup an error condition for rolling average
      clientWrapperStub.getRollingAverageForField.rejects(new Error('Error fetching rolling average'));

      const response: RunStepResponse = await stepUnderTest.executeStep(protoStep);
      // Decide on your step's behavior in case of an error with rolling average. Should it fail, pass with a warning, or error out?
      // Here, assuming it errors out:
      expect(response.getOutcome()).to.equal(RunStepResponse.Outcome.ERROR);
    });
  });

  describe('ExecuteStep', () => {
    const domain = 'example.com';
    const date = '2023-12-23T00:00:00.000Z';
    const field = 'deliveryErrors';
    const operator = 'be';
    const expectation = 5;

    describe('Successful Field Validation', () => {
      beforeEach(() => {
        protoStep.setData(Struct.fromJavaScript({ domain, date, field, operator, expectation }));
        clientWrapperStub.getDomainTrafficStatsDate.resolves({ deliveryErrors: 5 });
      });

      it('should respond with pass', async () => {
        const response: RunStepResponse = await stepUnderTest.executeStep(protoStep);
        expect(response.getOutcome()).to.equal(RunStepResponse.Outcome.PASSED);
      });
    });

    describe('Field Validation Failed', () => {
      beforeEach(() => {
        protoStep.setData(Struct.fromJavaScript({ domain, date, field, operator, expectation }));
        clientWrapperStub.getDomainTrafficStatsDate.resolves({ deliveryErrors: 10 });
      });

      it('should respond with fail', async () => {
        const response: RunStepResponse = await stepUnderTest.executeStep(protoStep);
        expect(response.getOutcome()).to.equal(RunStepResponse.Outcome.FAILED);
      });
    });

    describe('Error Handling', () => {
      beforeEach(() => {
        protoStep.setData(Struct.fromJavaScript({ domain, date, field, operator, expectation }));
        clientWrapperStub.getDomainTrafficStatsDate.rejects(new Error('API Error'));
      });

      it('should respond with error', async () => {
        const response: RunStepResponse = await stepUnderTest.executeStep(protoStep);
        expect(response.getOutcome()).to.equal(RunStepResponse.Outcome.ERROR);
      });
    });

    describe('Edge Cases', () => {
      it('should respond with error for invalid domain name', async () => {
        protoStep.setData(Struct.fromJavaScript({ domain: 'invalid domain', date, field, operator, expectation }));
        const response: RunStepResponse = await stepUnderTest.executeStep(protoStep);
        expect(response.getOutcome()).to.equal(RunStepResponse.Outcome.ERROR);
      });
      it('should respond with error for invalid date format', async () => {
        protoStep.setData(Struct.fromJavaScript({ domain, date: 'invalid date', field, operator, expectation }));
        const response: RunStepResponse = await stepUnderTest.executeStep(protoStep);
        expect(response.getOutcome()).to.equal(RunStepResponse.Outcome.ERROR);
      });
      it('should respond with error for missing field name', async () => {
        protoStep.setData(Struct.fromJavaScript({ domain, date, field: '', operator, expectation }));
        const response: RunStepResponse = await stepUnderTest.executeStep(protoStep);
        expect(response.getOutcome()).to.equal(RunStepResponse.Outcome.ERROR);
      });
      it('should respond with error for unsupported operator', async () => {
        protoStep.setData(Struct.fromJavaScript({ domain, date, field, operator: 'unsupported', expectation }));
        const response: RunStepResponse = await stepUnderTest.executeStep(protoStep);
        expect(response.getOutcome()).to.equal(RunStepResponse.Outcome.ERROR);
      });
    });
  });
});
