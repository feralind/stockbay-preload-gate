declare const echarts: any;
/** @deprecated Removed — trade chart now uses Apache ECharts. */
declare const LightweightCharts: any;

interface Window {
  __stockwayDisableSave?: boolean;
  __stockwayFlushSave?: () => boolean | Promise<boolean>;
  __STOCKWAY_INIT?: boolean;
  __stockwayTest?: any;
  __stockwayLogoOk?: (img: HTMLImageElement) => void;
  __stockwayLogoErr?: (img: HTMLImageElement) => void;
  __stockwayWalkthroughActive?: boolean;
  __stockwayPortfolioTourActive?: boolean;
  webkitAudioContext?: typeof AudioContext;
}
