import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { StoreModule } from '@ngrx/store';
import { mapStateKey } from './state/map.state';
import { mapReducer } from './state/map.reducer';
import { EffectsModule } from '@ngrx/effects';
import { MapEffects } from './state/map.effects';
import { ApplicationMapService } from './services/application-map.service';
import { MapDrawingButtonsComponent } from './components/map-drawing-buttons/map-drawing-buttons.component';
import { SharedModule } from '@tailormap-viewer/shared';

@NgModule({
  declarations: [
    MapDrawingButtonsComponent,
  ],
  imports: [
    CommonModule,
    StoreModule.forFeature(mapStateKey, mapReducer),
    EffectsModule.forFeature([MapEffects]),
    SharedModule,
  ],
  exports: [
    MapDrawingButtonsComponent,
  ],
})
export class ApplicationMapModule {
  constructor(_applicationMapService: ApplicationMapService) {}
}
