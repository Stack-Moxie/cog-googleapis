/* eslint-disable camelcase */
import { google, gmailpostmastertools_v1 } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';

export class GooglePostmasterToolsMixin {
  oauth2Client: OAuth2Client;

  postmasterToolsClient: gmailpostmastertools_v1.Gmailpostmastertools;

  async getAccessTokenWithRetry(retries = 3, delay = 1000) {
    for (let i = 0; i < retries; i++) {
      try {
        return await this.oauth2Client.getAccessToken();
      } catch (error) {
        if (i === retries - 1) throw error;
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 2; // Exponential backoff
      }
    }
  }

  async intializePostmasterToolsClient() {
    await this.getAccessTokenWithRetry();
    this.postmasterToolsClient = google.gmailpostmastertools({ version: 'v1', auth: this.oauth2Client });
  }

  public async getDomainTrafficStatsLastPage(domainName: string, pageToken: string = null) {
    // Fetch traffic statistics for a given domain
    // GET https://gmailpostmastertools.googleapis.com/v1/domains/{+parent}/trafficStats
    await this.intializePostmasterToolsClient();
    try {
      let response;
      if (pageToken) {
        response = await this.postmasterToolsClient.domains.trafficStats.list({
          parent: `domains/${domainName}`,
          pageToken,
        });
      } else {
        response = await this.postmasterToolsClient.domains.trafficStats.list({
          parent: `domains/${domainName}`,
        });
      }
      if (response.data.nextPageToken) {
        return await this.getDomainTrafficStatsLastPage(domainName, response.data.nextPageToken);
      } else {
        return response.data;
      }
    } catch (e) {
      throw new Error(`Error fetching domain traffic stats: ${e.message}`);
    }
  }

  public async getDomainTrafficStatsDate(domainName: string, date: string) {
    // Fetch traffic statistics for a given domain and date
    // GET https://gmailpostmastertools.googleapis.com/v1/domains/{domainName}/trafficStats/{date}
    await this.intializePostmasterToolsClient();
    try {
      const formattedDate = GooglePostmasterToolsMixin.formatDateForApi(date);
      const response = await this.postmasterToolsClient.domains.trafficStats.get({
        name: `domains/${domainName}/trafficStats/${formattedDate}`,
      });
      return response.data;
    } catch (e) {
      throw new Error(`Error fetching domain traffic stats: ${e.message}`);
    }
  }

  public async getRollingAverageForField(domainName: string, fieldName: string) {
    await this.intializePostmasterToolsClient();

    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - 30); // Set start date to 30 days before the end date

    try {
      const response = await this.postmasterToolsClient.domains.trafficStats.list({
        parent: `domains/${domainName}`,
        'startDate.year': startDate.getFullYear(),
        'startDate.month': startDate.getMonth() + 1, // JavaScript months are 0-indexed
        'startDate.day': startDate.getDate(),
        'endDate.year': endDate.getFullYear(),
        'endDate.month': endDate.getMonth() + 1, // JavaScript months are 0-indexed
        'endDate.day': endDate.getDate(),
      });

      // Assuming response.data.trafficStats is an array of stats with the specified field
      let sum = 0.000;
      let count = 0;

      response.data.trafficStats?.forEach(stat => {
        if (stat[fieldName] !== undefined) {
          sum += stat[fieldName];
          count++;
        }
      });

      if (count === 0) {
        return -1;
      }

      return sum / count;
    } catch (e) {
      return -1;
    }
  }

  private static formatDateForApi(date: string): string {
    // Assuming the input date format is YYYYMMDD and needs no further formatting
    // Add additional logic here if the input date format is different
    return date;
  }
}
