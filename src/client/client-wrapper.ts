import * as grpc from '@grpc/grpc-js';
import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { Field } from '../core/base-step';
import { FieldDefinition } from '../proto/cog_pb';
import { GooglePostmasterToolsMixin, PostmasterV2Mixin } from './mixins';

class ClientWrapper {
  public static expectedAuthFields: Field[] = [
    {
      field: 'clientId',
      type: FieldDefinition.Type.STRING,
      description: 'Google Client ID',
      help: 'The client ID for your Google application.',
    },
    {
      field: 'clientSecret',
      type: FieldDefinition.Type.STRING,
      description: 'Google Client Secret',
      help: 'The client secret for your Google application.',
    },
    {
      field: 'redirectUri',
      type: FieldDefinition.Type.STRING,
      description: 'Google Redirect URI',
      help: 'The redirect URI configured in your Google application.',
    },
    {
      field: 'refreshToken',
      type: FieldDefinition.Type.STRING,
      description: 'Google OAuth2 Refresh Token',
      help: 'The refresh token obtained through Google OAuth2 authentication.',
    },
  ];

  oauth2Client: OAuth2Client;

  client: any;

  constructor(auth: grpc.Metadata, clientConstructor = google) {
    const clientId: string = auth.get('clientId').toString();
    const clientSecret: string = auth.get('clientSecret').toString();
    const redirectUri: string = auth.get('redirectUri').toString();
    const refreshToken: string = auth.get('refreshToken').toString();

    // Initialize the Google OAuth2 client with credentials from the auth metadata.
    this.oauth2Client = new OAuth2Client(clientId, clientSecret, redirectUri);

    this.oauth2Client.setCredentials({
      refresh_token: refreshToken,
    });

    // Set the OAuth2 client to the Google API client.
    this.client = clientConstructor;
    this.client.options({ auth: this.oauth2Client });
  }
}

interface ClientWrapper extends GooglePostmasterToolsMixin, PostmasterV2Mixin {}
applyMixins(ClientWrapper, [GooglePostmasterToolsMixin, PostmasterV2Mixin]);

function applyMixins(derivedCtor: any, baseCtors: any[]) {
  baseCtors.forEach((baseCtor) => {
    Object.getOwnPropertyNames(baseCtor.prototype).forEach((name) => {
      Object.defineProperty(derivedCtor.prototype, name, Object.getOwnPropertyDescriptor(baseCtor.prototype, name));
    });
  });
}

export { ClientWrapper };
