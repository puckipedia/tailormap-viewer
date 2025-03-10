/*
 * Public API Surface of map
 */
/// <reference path="typings.d.ts" />

if (typeof window.$localize === 'undefined') {
  window.$localize = (messageParts: TemplateStringsArray) => messageParts.join('');
}

export * from './lib/models';
export * from './lib/map-service/map.service';
export * from './lib/map/map.component';
export * from './lib/map.module';
export * from './lib/helpers/ogc.helper';
export * from './lib/helpers/map-size.helper';
export * from './lib/helpers/scale.helper';
export * from './lib/helpers/server-type.helper';
export * from './lib/helpers/extent.helper';
export * from './lib/helpers/coordinate.helper';
