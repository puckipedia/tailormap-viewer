import { createHttpFactory, HttpMethod, SpectatorHttp } from '@ngneat/spectator/jest';
import { TailormapApiV1Service } from './tailormap-api-v1.service';

describe('TailormapApiV1Service', () => {

  let spectator: SpectatorHttp<TailormapApiV1Service>;
  const createHttp = createHttpFactory(TailormapApiV1Service);

  beforeEach(() => spectator = createHttp());

  test('queries API for getApplication$', () => {
    spectator.service.getApplication$({}).subscribe();
    spectator.expectOne('/v1/app', HttpMethod.GET);
  });

  test('queries API with app/version for getApplication$', () => {
    spectator.service.getApplication$({ version: 'v1', name: 'test' }).subscribe();
    spectator.expectOne('/v1/app?version=v1&name=test', HttpMethod.GET);
  });

  test('queries API with id for getApplication$', () => {
    spectator.service.getApplication$({ id: 123 }).subscribe();
    spectator.expectOne('/v1/app?id=123', HttpMethod.GET);
  });

  test('queries API for getMap$', () => {
    spectator.service.getMap$(1).subscribe();
    spectator.expectOne('/v1/map/1', HttpMethod.GET);
  });

  test('queries API for getComponents$', () => {
    spectator.service.getComponents$(1).subscribe();
    spectator.expectOne('/v1/components/1', HttpMethod.GET);
  });

  test('queries API for getLayers$', () => {
    spectator.service.getLayers$(1).subscribe();
    spectator.expectOne('/v1/layers/1', HttpMethod.GET);
  });

  test('queries API for getDescribeLayer$', () => {
    spectator.service.getDescribeLayer$({ applicationId: 1, layerId: 1 }).subscribe();
    spectator.expectOne('/v1/describelayer/1/1', HttpMethod.GET);
  });

});
