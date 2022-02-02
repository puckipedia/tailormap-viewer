import { Injectable, OnDestroy } from '@angular/core';
import { Store } from '@ngrx/store';
import { LayerModel, LayerTypesEnum, MapService, OgcHelper, WMSLayerModel, WMTSLayerModel } from '@tailormap-viewer/map';
import { selectBaseLayers, selectLayers, selectMapOptions } from '../state/core.selectors';
import { concatMap, filter, forkJoin, map, Observable, of, Subject, take, takeUntil } from 'rxjs';
import { AppLayerModel, ServiceModel, ServiceProtocol } from '@tailormap-viewer/api';
import { HttpClient, HttpParams } from '@angular/common/http';

@Injectable({
   providedIn: 'root',
})
export class ApplicationMapService implements OnDestroy {

  private destroyed = new Subject();

  constructor(
    private store$: Store,
    private mapService: MapService,
    private httpClient: HttpClient,
  ) {
    const isValidLayer = (layer: LayerModel | null): layer is LayerModel => layer !== null;
    this.store$.select(selectMapOptions)
      .pipe(
        takeUntil(this.destroyed),
        filter(mapOptions => !!mapOptions),
      )
      .subscribe(mapOptions => {
        if (mapOptions === null) {
          return;
        }
        this.mapService.initMap(mapOptions);
      });

    this.store$.select(selectBaseLayers)
      .pipe(
        takeUntil(this.destroyed),
        concatMap(baseLayers => this.getLayersAndLayerManager$(baseLayers)),
      )
      .subscribe(([ baseLayers, layerManager ]) => {
        const validBaseLayers = baseLayers.filter(isValidLayer);
        if (validBaseLayers.length === 0) {
          return;
        }
        // @TODO: support more than 1 baseLayer
        layerManager.setBackgroundLayer(validBaseLayers[0]);
      });

    this.store$.select(selectLayers)
      .pipe(
        takeUntil(this.destroyed),
        concatMap(layers => this.getLayersAndLayerManager$(layers)),
      )
      .subscribe(([ layers, layerManager ]) => {
        layerManager.setLayers(layers.filter(isValidLayer));
      });
  }

  private getLayersAndLayerManager$(serviceLayers: Array<{ layer: AppLayerModel; service?: ServiceModel }>) {
    const layers$ = serviceLayers
      .reverse() // until we have order add the layers in reverse order
      .map(layer => this.convertAppLayerToMapLayer$(layer.layer, layer.service));
    return forkJoin([
      forkJoin(layers$),
      this.mapService.getLayerManager$().pipe(take(1)),
    ]);
  }

  public ngOnDestroy() {
    this.destroyed.next(null);
    this.destroyed.complete();
  }

  private convertAppLayerToMapLayer$(appLayer: AppLayerModel, service?: ServiceModel): Observable<LayerModel | null> {
    if (!service) {
      return of(null);
    }
    if (service.protocol === ServiceProtocol.TILED) {
      return this.getCapabilitiesForWMTS$(service)
        .pipe(
          map((capabilities: string): WMTSLayerModel => ({
            id: `${appLayer.id}`,
            layers: appLayer.displayName,
            name: appLayer.displayName,
            layerType: LayerTypesEnum.WMTS,
            visible: appLayer.visible,
            url: service.url,
            crossOrigin: 'anonymous',
            capabilities: capabilities || '',
          })),
        );
    }
    if (service.protocol === ServiceProtocol.WMS) {
      const layer: WMSLayerModel = {
        id: `${appLayer.id}`,
        layers: appLayer.displayName,
        name: appLayer.displayName,
        layerType: LayerTypesEnum.WMS,
        visible: appLayer.visible,
        url: service.url,
        crossOrigin: 'anonymous',
      };
      return of(layer);
    }
    return of(null);
  }

  private getCapabilitiesForWMTS$(service: ServiceModel): Observable<string> {
    if (!!service.capabilities) {
      return of(service.capabilities);
    }
    return this.httpClient.get(OgcHelper.filterOgcUrlParameters(service.url), {
      responseType: 'text',
      params: new HttpParams().append('REQUEST', 'GetCapabilities').append('SERVICE', 'WMTS'),
    });
  }

}
