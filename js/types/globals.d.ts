declare const LightweightCharts: any;

interface Window {
  __stockwayDisableSave?: boolean;
  __stockwayFlushSave?: () => unknown;
  __STOCKWAY_INIT?: boolean;
  __stockwayTest?: any;
  __stockwayLogoOk?: (img: HTMLImageElement) => void;
  __stockwayLogoErr?: (img: HTMLImageElement) => void;
  __stockwayWalkthroughActive?: boolean;
  __stockwayPortfolioTourActive?: boolean;
  webkitAudioContext?: typeof AudioContext;
}
