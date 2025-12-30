import { vibexClient } from './vibexClient';

export const Core = vibexClient.integrations.Core;

export const InvokeLLM = vibexClient.integrations.Core.InvokeLLM;

export const SendEmail = vibexClient.integrations.Core.SendEmail;

export const SendSMS = vibexClient.integrations.Core.SendSMS;

export const UploadFile = vibexClient.integrations.Core.UploadFile;

export const GenerateImage = vibexClient.integrations.Core.GenerateImage;

export const ExtractDataFromUploadedFile =
    vibexClient.integrations.Core.ExtractDataFromUploadedFile;
