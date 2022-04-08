import { AppLayerModel, LayerTreeNodeModel } from '@tailormap-viewer/api';
import { ExtendedLayerTreeNodeModel } from '../models';
import { TreeModel } from '@tailormap-viewer/shared';

export class LayerTreeNodeHelper {

  public static isAppLayerNode(node: LayerTreeNodeModel) {
    return typeof node.appLayerId === 'number';
  }

  public static getExtendedLayerTreeNode(node: LayerTreeNodeModel): ExtendedLayerTreeNodeModel {
    if (LayerTreeNodeHelper.isAppLayerNode(node)) {
      return node;
    }
    return {
      ...node,
      expanded: true,
    };
  }

  public static getTreeModelForLayerTreeNode(node: ExtendedLayerTreeNodeModel, layers?: AppLayerModel[]): TreeModel {
    const isAppLayerNode = LayerTreeNodeHelper.isAppLayerNode(node);
    const layer = isAppLayerNode
      ? (layers || []).find(l => l.id === node.appLayerId)
      : null;
    return {
      id: node.id,
      label: node.name,
      type: isAppLayerNode ? 'layer' : 'level',
      metadata: layer,
      checked: isAppLayerNode
        ? layer?.visible
        : true, // must be boolean but for levels this is determined by the checked status of the layers inside
      expanded: node.expanded,
    };
  }

  public static findLayerTreeNode(layerTreeNodes: LayerTreeNodeModel[], id: string) {
    return layerTreeNodes.find(l => l.id === id);
  }

  public static getAppLayerIds(layerTreeNodes: LayerTreeNodeModel[], child?: LayerTreeNodeModel): number[] {
    const childIds = (child?.childrenIds || []).map(id => {
      return LayerTreeNodeHelper.getAppLayerIds(layerTreeNodes, LayerTreeNodeHelper.findLayerTreeNode(layerTreeNodes, id));
    });
    return (child?.appLayerId ? [child.appLayerId] : []).concat(...childIds);
  };

  public static layerTreeNodeToTree(layerTreeNodes: ExtendedLayerTreeNodeModel[], layers: AppLayerModel[]) {
    const root = layerTreeNodes.find(l => l.root);
    if (!root) {
      return [];
    }
    const tree = LayerTreeNodeHelper.traverseTree<TreeModel<AppLayerModel>>(
      layerTreeNodes,
      root.id,
      (node, children) => ({
        ...LayerTreeNodeHelper.getTreeModelForLayerTreeNode(node, layers),
        children,
      }),
    );
    if (!tree) {
      return [];
    }
    // Skip root, start with children
    return tree.children || [];
  }

  private static traverseTree<T>(
    layerTreeNodes: ExtendedLayerTreeNodeModel[],
    id: string,
    transformer: (node: ExtendedLayerTreeNodeModel, children: T[]) => T | null): T | null {
    const node = LayerTreeNodeHelper.findLayerTreeNode(layerTreeNodes, id);
    if (!node) {
      return null;
    }
    const children = node.childrenIds
      .map(childId => LayerTreeNodeHelper.traverseTree<T>(layerTreeNodes, childId, transformer))
      .filter<T>((n: T | null): n is T => !!n);
    return transformer(node, children);
  }

}
