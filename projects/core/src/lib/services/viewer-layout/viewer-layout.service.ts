import { Injectable } from '@angular/core';
import { MenubarService } from '../../components/menubar';
import { Store } from '@ngrx/store';
import { combineLatest, map, Observable } from 'rxjs';
import { ExtentHelper, MapService, MapViewDetailsModel, OpenlayersExtent } from '@tailormap-viewer/map';

@Injectable({
  providedIn: 'root',
})
export class ViewerLayoutService {

  constructor(
    private menuBarService: MenubarService,
    private store$: Store,
    private mapService: MapService,
  ) { }

  /**
   * Add a property to the MapViewDetailsModel from MapService.getMapViewDetails$() with the map extent that is not covered by UI elements.
   */
  public getUIVisibleMapExtent$(): Observable<MapViewDetailsModel & { uiVisibleExtent: OpenlayersExtent | null }> {
    return combineLatest([ this.mapService.getMapViewDetails$(), this.menuBarService.getPanelWidth$() ]).pipe(
      map(([ mapViewDetails, panelWidth ]) => {

        let uiVisibleExtent = null;
        if (mapViewDetails.extent !== null) {
          uiVisibleExtent = mapViewDetails.extent.slice();

          if (panelWidth > 0) {
            // Panel is on left side, reduce bounding box minX by width of panel
            uiVisibleExtent[0] = uiVisibleExtent[0] + (panelWidth * mapViewDetails.resolution);
          }

          const mapControlsTopLeft = document.querySelector('div.map-controls-left:not(.map-controls-left--on-bottom)')?.getBoundingClientRect();
          if (mapControlsTopLeft) {
            uiVisibleExtent[1] = uiVisibleExtent[1] + (mapControlsTopLeft.bottom * mapViewDetails.resolution);
          }

          const zoomButtons = document.querySelector('div.zoom-buttons')?.getBoundingClientRect();
          if (zoomButtons) {
            uiVisibleExtent[2] = uiVisibleExtent[2] - ((window.innerWidth - zoomButtons.left) * mapViewDetails.resolution);
          }

          // Hardcoded bottom margin for scalebar and coordinates, which aren't always visible...
          uiVisibleExtent[3] = uiVisibleExtent[3] - (60 * mapViewDetails.resolution);

          if (ExtentHelper.isEmpty(uiVisibleExtent)) {
            uiVisibleExtent = null;
          }
        }
        return {
          ...mapViewDetails,
          uiVisibleExtent,
        };
      }),
    );
  }

}
