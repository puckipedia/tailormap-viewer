import { TreeDragDropService } from './tree-drag-drop.service';
import { SharedImportsModule } from '@tailormap-viewer/shared';
import { TreeService } from './tree.service';
import { NgZone } from '@angular/core';
import { render, screen } from '@testing-library/angular';
import { TreeComponent } from './tree.component';
import { BehaviorSubject } from 'rxjs';
import { TreeModel } from './models';
import userEvent from '@testing-library/user-event';

const getTree = () => [
  getTreeModel(),
  getTreeModel({
    id: '2',
    label: 'Item 2',
    children: [
      getTreeModel({ id: '2_1', label: 'Item 2 - 1' }),
      getTreeModel({
        id: '2_2',
        label: 'Item 2 - 2',
        children: [
          getTreeModel({ id: '2_2_1', label: 'Item 2 - 2 - 1' }),
          getTreeModel({ id: '2_2_2', label: 'Item 2 - 2 - 2' }),
        ],
      }),
      getTreeModel({ id: '2_2', label: 'Item 2 - 2' }),
    ],
  }),
  getTreeModel({ id: '3', label: 'Item 3' }),
];

const getTreeModel = (overrides?: Partial<TreeModel>): TreeModel => ({
  id: '1',
  label: 'Item 1',
  type: 'test',
  children: undefined,
  metadata: undefined,
  readOnlyItem: false,
  checked: false,
  expanded: false,
  ...overrides,
});

describe('TreeComponent', () => {

  test('renders tree', async () => {
    const ngZoneRunMock = jest.fn((cb: () => void) => cb());
    const ngZoneOutsideMock = jest.fn();
    const ngZone = { run: ngZoneRunMock, runOutsideAngular: ngZoneOutsideMock } as unknown as NgZone;
    const treeService = new TreeService(ngZone);
    const { fixture } = await render(TreeComponent, {
      providers: [
        { provide: TreeService, useValue: treeService },
        { provide: TreeDragDropService, useValue: undefined },
      ],
      imports: [
        SharedImportsModule,
      ],
    });
    expect(fixture.componentInstance).toBeTruthy();

    // setup service
    const tree = getTree();
    const treeData = new BehaviorSubject<TreeModel[]>(tree);
    // catch expand
    const expandNodes = (n: TreeModel, nodeId: string): TreeModel => {
      if (n.id === nodeId) {
        return { ...n, expanded: !n.expanded };
      }
      if (typeof n.children !== 'undefined') {
        return { ...n, children: n.children.map(c => expandNodes(c, nodeId) )};
      }
      return n;
    };
    treeService.nodeExpansionChangedSource$
      .subscribe(nodeId => {
        treeData.next(treeData.value.map(n => expandNodes(n, nodeId)));
      });
    treeService.setDataSource(treeData.asObservable());

    expect(await screen.findByText('Item 1')).toBeInTheDocument();
    expect(await screen.findByText('Item 2')).toBeInTheDocument();
    expect(await screen.queryByText('Item 2 - 1')).toBeNull();

    userEvent.click(await screen.findByRole('button', { name: 'toggle Item 2' }));
    expect(await screen.findByText('Item 1')).toBeInTheDocument();
    expect(await screen.findByText('Item 2')).toBeInTheDocument();
    expect(await screen.findByText('Item 2 - 1')).toBeInTheDocument();
    expect(await screen.queryByText('Item 2 - 2 - 1')).toBeNull();

    userEvent.click(await screen.findByRole('button', { name: 'toggle Item 2 - 2' }));
    expect(await screen.findByText('Item 1')).toBeInTheDocument();
    expect(await screen.findByText('Item 2')).toBeInTheDocument();
    expect(await screen.findByText('Item 2 - 1')).toBeInTheDocument();
    expect(await screen.findByText('Item 2 - 2 - 1')).toBeInTheDocument();
  });

});
