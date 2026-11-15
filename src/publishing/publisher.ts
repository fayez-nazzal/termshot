export interface PublishRequest {
  filePath: string;
  sha256: string;
  dest: string;
  size: number;
  label: string;
}

export interface PublishedImage {
  url: string;
  markdown: string;
}

export interface Publisher {
  readonly id: string;
  readonly displayName: string;
  readonly destinationFormat: string;
  readonly resizesEmbed: boolean;
  destinationProblem(dest: string): string | null;
  publish(request: PublishRequest): PublishedImage;
}

export const DEFAULT_EMBED_WIDTH = 2560;
