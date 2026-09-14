export interface BridgeConfig { url: string; origin: string }
export function parseBridgeConfig(value: unknown): BridgeConfig;
export function readBridgeConfig(path?: string): BridgeConfig;
export function renderBridgeAsset(source: string, config: BridgeConfig): string;
