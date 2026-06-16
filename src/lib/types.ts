export type PublicProvider = {
  id: string;
  name: string;
  baseUrl: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  models?: PublicModel[];
};

export type PublicModel = {
  id: string;
  providerId: string;
  providerName?: string;
  name: string;
  type: string;
  capabilities: string;
  enabled: boolean;
};

export type ChatMessageDto = {
  id: string;
  role: string;
  content: string;
  modelName?: string | null;
  imageUrl?: string | null;
  imageBase64?: string | null;
  createdAt: string;
};

export type ConversationDto = {
  id: string;
  title: string;
  providerId?: string | null;
  modelId?: string | null;
  modelName?: string | null;
  createdAt: string;
  updatedAt: string;
  messages?: ChatMessageDto[];
};
