import * as chai from 'chai';
import { default as sinon } from 'ts-sinon';
import * as sinonChai from 'sinon-chai';
import 'mocha';
import { google } from 'googleapis';
import { ClientWrapper } from '../../src/client/client-wrapper';
import { Metadata } from '@grpc/grpc-js';
import { OAuth2Client } from 'google-auth-library';

chai.use(sinonChai);

describe('ClientWrapper', () => {
  const expect = chai.expect;
  let metadata: Metadata;
  let clientWrapperUnderTest: ClientWrapper;
  let googleApiClientStub: any;
  let oauth2ClientStub: any;

  beforeEach(() => {
    // Stub for the Google API client
    googleApiClientStub = {
      domains: {
        trafficStats: {
          list: sinon.stub(),
          get: sinon.stub(),
        },
      },
    };

    googleApiClientStub.domains.trafficStats.list.resolves({ data: {} });
    googleApiClientStub.domains.trafficStats.get.resolves({ data: {} });
    // Stub the google API constructor
    sinon.stub(google, 'gmailpostmastertools').returns(googleApiClientStub);

    // Stub for the OAuth2Client
    oauth2ClientStub = sinon.createStubInstance(OAuth2Client);
    oauth2ClientStub.getAccessToken.resolves({ token: 'fake-access-token' });

    // Create metadata for authentication
    metadata = new Metadata();
    metadata.add('clientId', 'test-client-id');
    metadata.add('clientSecret', 'test-client-secret');
    metadata.add('redirectUri', 'test-redirect-uri');
    metadata.add('refreshToken', 'test-refresh-token');

    // Initialize the client wrapper instance
    clientWrapperUnderTest = new ClientWrapper(metadata);
    clientWrapperUnderTest.oauth2Client = oauth2ClientStub;
  });

  afterEach(() => {
    // Restore all stubs
    sinon.restore();
  });

  it('getDomainTrafficStatsLastPage calls Google API with correct parameters', async () => {
    const domainName = 'example.com';

    // Invoke the method
    await clientWrapperUnderTest.getDomainTrafficStatsLastPage(domainName);
    // Check if the Google API client method was called with correct parameters
    expect(googleApiClientStub.domains.trafficStats.list).to.have.been.calledWith({
      parent: `domains/${domainName}`,
    });

    // Check if the OAuth2Client.getAccessToken was called
    expect(oauth2ClientStub.getAccessToken).to.have.been.called;
  });

  it('getDomainTrafficStatsDate calls Google API with correct parameters', async () => {
    const domainName = 'example.com';

    // Invoke the method
    await clientWrapperUnderTest.getDomainTrafficStatsDate(domainName, '20200101');
    // Check if the Google API client method was called with correct parameters
    expect(googleApiClientStub.domains.trafficStats.get).to.have.been.calledWith({
      name: `domains/${domainName}/trafficStats/20200101`,
    });

    // Check if the OAuth2Client.getAccessToken was called
    expect(oauth2ClientStub.getAccessToken).to.have.been.called;
  });

  it('getRollingAverageForField calls Google API with correct parameters and calculates average', async () => {
    const domainName = 'example.com';
    const fieldName = 'deliveryErrors';
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000); // 30 days before endDate

    // Mock trafficStats.list response to simulate 30 days of data with incremental values
    const mockTrafficStatsData = Array.from({ length: 30 }, (_, index) => ({
      deliveryErrors: index + 1, // Just an example, replace with realistic mock data
      date: new Date(startDate.getTime() + index * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // ISO format
    }));

    googleApiClientStub.domains.trafficStats.list.resolves({
      data: {
        trafficStats: mockTrafficStatsData,
      },
    });

    // Invoke the method
    const rollingAverage = await clientWrapperUnderTest.getRollingAverageForField(domainName, fieldName);

    // Calculate expected average based on mock data
    const expectedAverage = mockTrafficStatsData.reduce((acc, curr) => acc + curr[fieldName], 0) / mockTrafficStatsData.length;

    // Check if the Google API client method was called with correct parameters
    expect(googleApiClientStub.domains.trafficStats.list).to.have.been.calledWithMatch({
      parent: `domains/${domainName}`,
      'startDate.year': startDate.getFullYear(),
      'startDate.month': startDate.getMonth() + 1,
      'startDate.day': startDate.getDate(),
      'endDate.year': endDate.getFullYear(),
      'endDate.month': endDate.getMonth() + 1,
      'endDate.day': endDate.getDate(),
    });

    // Check if the rolling average was calculated correctly
    expect(rollingAverage).to.equal(expectedAverage);

    // Check if the OAuth2Client.getAccessToken was called
    expect(oauth2ClientStub.getAccessToken).to.have.been.called;
  });
});
