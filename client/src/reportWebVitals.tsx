import { ReportHandler } from 'web-vitals';

export function reportWebVitals(handler: ReportHandler | undefined) {
  if (handler) {
    import('web-vitals').then(({ getCLS, getFID, getFCP, getLCP, getTTFB }) => {
      getCLS(handler);
      getFID(handler);
      getFCP(handler);
      getLCP(handler);
      getTTFB(handler);
    });
  }
}
