import { Component, NgZone, OnDestroy, OnInit } from '@angular/core';
import { filter, Observable, of, Subject, takeUntil } from 'rxjs';
import { BaseTreeModel, BrowserHelper, NodePositionChangedEventModel, TreeDragDropService, TreeService } from '@tailormap-viewer/shared';
import { map } from 'rxjs/operators';
import { MenubarService } from '../../menubar';
import { TocMenuButtonComponent } from '../toc-menu-button/toc-menu-button.component';
import { Store } from '@ngrx/store';
import { AppLayerModel, BaseComponentTypeEnum } from '@tailormap-viewer/api';
import { MapService } from '@tailormap-viewer/map';
import { selectFilteredLayerTree, selectFilterEnabled, selectInfoTreeNodeId } from '../state/toc.selectors';
import { setInfoTreeNodeId, toggleFilterEnabled } from '../state/toc.actions';
import { selectSelectedNode } from '../../../map/state/map.selectors';
import { moveLayerTreeNode, setLayerVisibility, setSelectedLayerId, toggleLevelExpansion } from '../../../map/state/map.actions';

interface AppLayerTreeModel extends BaseTreeModel {
  metadata: AppLayerModel;
}
const isAppLayerTreeModel = (node: BaseTreeModel): node is AppLayerTreeModel => !!node.metadata && node.metadata.layerName;

@Component({
  selector: 'tm-toc',
  templateUrl: './toc.component.html',
  styleUrls: [ './toc.component.css', '../../../../../assets/layer-tree-style.css' ],
  providers: [ TreeService, TreeDragDropService ],
})
export class TocComponent implements OnInit, OnDestroy {

  private destroyed = new Subject();
  public visible$: Observable<boolean> = of(false);
  public scale: number | null = null;

  public infoTreeNodeId$ = this.store$.select(selectInfoTreeNodeId);

  public filterEnabled$ = this.store$.select(selectFilterEnabled);
  public isMobileDevice = BrowserHelper.isTouchDevice;
  public dragDropEnabled = !this.isMobileDevice;

  constructor(
    private store$: Store,
    private treeService: TreeService<AppLayerModel>,
    private treeDragDropService: TreeDragDropService,
    private menubarService: MenubarService,
    private mapService: MapService,
    private ngZone: NgZone,
  ) {}

  public ngOnInit(): void {
    this.visible$ = this.menubarService.isComponentVisible$(BaseComponentTypeEnum.TOC);
    this.mapService.getMapViewDetails$()
      .pipe(takeUntil(this.destroyed), map(resolution => resolution.scale))
      .subscribe(scale => this.scale = scale);

    this.treeService.setDataSource(
      this.store$.select(selectFilteredLayerTree),
    );
    this.treeService.setSelectedNode(this.store$.select(selectSelectedNode));
    this.treeDragDropService.setDragDropEnabled(!this.isMobileDevice);
    this.treeService.checkStateChangedSource$
      .pipe(
        takeUntil(this.destroyed),
        map(checkChange => checkChange
          .filter(isAppLayerTreeModel)
          .map(node => ({ id: node.metadata.id, checked: !!node.checked }))),
      )
      .subscribe(checkChanged => this.store$.dispatch(setLayerVisibility({ visibility: checkChanged })));
    this.treeService.nodeExpansionChangedSource$
      .pipe(takeUntil(this.destroyed))
      .subscribe(node => this.store$.dispatch(toggleLevelExpansion({ id: node.id })));
    this.treeService.selectionStateChangedSource$
      .pipe(
        takeUntil(this.destroyed),
        filter(isAppLayerTreeModel),
        map(node => node.metadata.id),
      )
      .subscribe(layerId => this.store$.dispatch(setSelectedLayerId({ layerId })));

    this.treeService.nodePositionChangedSource$
      .pipe(takeUntil(this.destroyed))
      .subscribe((evt) => this.handleNodePositionChanged(evt));

    this.menubarService.registerComponent(TocMenuButtonComponent);
  }

  public ngOnDestroy() {
    this.destroyed.next(null);
    this.destroyed.complete();
  }

  public showTreeNodeInfo(infoTreeNodeId: string) {
    this.store$.dispatch(setInfoTreeNodeId({ infoTreeNodeId }));
  }

  public layerInfoClosed() {
    this.store$.dispatch(setInfoTreeNodeId({ infoTreeNodeId: undefined }));
  }
  public toggleLayerFilter() {
    this.store$.dispatch(toggleFilterEnabled());
  }

  public handleNodePositionChanged(evt: NodePositionChangedEventModel) {
    this.ngZone.run(() => {
      this.store$.dispatch(moveLayerTreeNode({
        nodeId: evt.nodeId,
        position: evt.position,
        parentId: evt.toParent || undefined,
        sibling: evt.sibling,
      }));
    });
  }

  public toggleReordering() {
    this.dragDropEnabled = !this.dragDropEnabled;
    this.treeDragDropService.setDragDropEnabled(this.dragDropEnabled);
  }
}
