import Style from 'ol/style/Style';
import Fill from 'ol/style/Fill';
import Stroke from 'ol/style/Stroke';
import Text from 'ol/style/Text';
import { default as RegularShape, Options as RegularShapeOptions } from 'ol/style/RegularShape';
import { MapStyleModel, MapStylePointType, OlMapStyleType } from '../models';
import { FeatureModel, FeatureModelAttributes } from '@tailormap-viewer/api';
import Feature from 'ol/Feature';
import { Circle, Geometry, LinearRing, LineString, MultiLineString, MultiPoint, MultiPolygon, Point, Polygon } from 'ol/geom';
import { forEach as forEachSegments } from 'ol/geom/flat/segments';
import { buffer as bufferExtent } from 'ol/extent';
import RenderFeature from 'ol/render/Feature';
import { FeatureHelper } from './feature.helper';
import { ColorHelper, StyleHelper } from '@tailormap-viewer/shared';
import { Icon } from 'ol/style';
import { GeometryTypeHelper } from './geometry-type.helper';
import { MapSizeHelper } from '../helpers/map-size.helper';
import { OL3Parser } from 'jsts/org/locationtech/jts/io';
import { BufferOp } from 'jsts/org/locationtech/jts/operation/buffer';
import { fromCircle } from 'ol/geom/Polygon';

export class MapStyleHelper {

  private static DEFAULT_COLOR = '#cc0000';
  private static DEFAULT_SYMBOL_SIZE = 5;
  private static DEFAULT_FONT_SIZE = 12;
  private static DEFAULT_LABEL_COLOR = '#000000';
  private static BUFFER_OPACITY_DECREASE = 20;

  private static DEFAULT_STYLE = MapStyleHelper.mapStyleModelToOlStyle({
    styleKey: 'DEFAULT_STYLE',
    zIndex: 0,
    strokeColor: MapStyleHelper.DEFAULT_COLOR,
    pointType: 'square',
    pointFillColor: MapStyleHelper.DEFAULT_COLOR,
  });

  public static getStyle<T extends FeatureModelAttributes = FeatureModelAttributes>(styleConfig?: MapStyleModel | ((feature: FeatureModel<T>) => MapStyleModel)): OlMapStyleType {
    if (typeof styleConfig === 'undefined') {
      return MapStyleHelper.DEFAULT_STYLE;
    }
    if (typeof styleConfig === 'function') {
      return (feature: Feature<Geometry> | RenderFeature, resolution: number) => {
        if (feature instanceof RenderFeature) {
          return MapStyleHelper.DEFAULT_STYLE;
        }
        const featureModel = FeatureHelper.getFeatureModelForFeature<T>(feature);
        if (!featureModel) {
          return MapStyleHelper.DEFAULT_STYLE;
        }
        return MapStyleHelper.mapStyleModelToOlStyle(styleConfig(featureModel), feature, 20 * resolution);
      };
    }
    return MapStyleHelper.mapStyleModelToOlStyle(styleConfig);
  }

  private static mapStyleModelToOlStyle(styleConfig: MapStyleModel, feature?: Feature<Geometry>, resolution?: number) {
    const baseStyle = new Style();
    const stroke = MapStyleHelper.createStroke(styleConfig);
    if (stroke) {
      baseStyle.setStroke(stroke);
    }
    const fill = MapStyleHelper.createFill(styleConfig, MapStyleHelper.getOpacity(styleConfig.fillOpacity, !!styleConfig.buffer));
    if (fill) {
      baseStyle.setFill(fill);
    }
    if (styleConfig.fillColor) {
      baseStyle.setFill(new Fill({
        color: styleConfig.stripedFill
          ? MapStyleHelper.createFillPattern(styleConfig.fillColor, styleConfig.fillOpacity)
          : ColorHelper.getRgbStyleForColor(styleConfig.fillColor, styleConfig.fillOpacity),
      }));
    }
    const styles: Style[] = [baseStyle];
    if (styleConfig.pointType) {
      styles.push(...MapStyleHelper.createShape(styleConfig.pointType, styleConfig));
    }
    styles.push(...MapStyleHelper.createArrowStyles(styleConfig, feature, baseStyle.getStroke()));
    if (styleConfig.label) {
      styles.push(...MapStyleHelper.createLabelStyle(styleConfig, feature));
    }
    if (styleConfig.isSelected && (!styleConfig.pointType || (!!styleConfig.pointType && !styleConfig.label)) && typeof feature !== 'undefined') {
      styles.push(...MapStyleHelper.createOutlinedSelectionRectangle(feature, 1.3 * (resolution || 0)));
    }
    if (styleConfig.isSelected && (!styleConfig.pointType || (!!styleConfig.pointType && !styleConfig.label)) && typeof feature !== 'undefined') {
      styles.push(...MapStyleHelper.createOutlinedSelectionRectangle(feature, 1.3 * (resolution || 0)));
    }
    if (typeof styleConfig.buffer !== 'undefined' && styleConfig.buffer > 0 && typeof feature !== 'undefined') {
      styles.push(...MapStyleHelper.createBuffer(feature, styleConfig.buffer, styleConfig));
    }
    return styles;
  }

  private static createStroke(styleConfig: MapStyleModel, overrideOpacity?: number) {
    if (!styleConfig.strokeColor) {
      return null;
    }
    const dash = StyleHelper.getDashArray(styleConfig.strokeType, styleConfig.strokeWidth);
    const stroke = new Stroke({
      color: ColorHelper.getRgbStyleForColor(styleConfig.strokeColor, overrideOpacity || styleConfig.strokeOpacity),
      width: styleConfig.strokeWidth || 1,
    });
    if (dash.length > 0) {
      stroke.setLineDash(dash);
      stroke.setLineCap(styleConfig.strokeType === 'dot' ? 'round' : 'square');
    }
    return stroke;
  }

  private static createFill(styleConfig: MapStyleModel, overrideOpacity?: number) {
    if (!styleConfig.fillColor) {
      return null;
    }
    return new Fill({
      color: styleConfig.stripedFill
        ? MapStyleHelper.createFillPattern(styleConfig.fillColor, overrideOpacity || styleConfig.fillOpacity)
        : ColorHelper.getRgbStyleForColor(styleConfig.fillColor, overrideOpacity || styleConfig.fillOpacity),
    });
  }

  private static createLabelStyle(styleConfig: MapStyleModel, feature?: Feature<Geometry>) {
    const symbolSize = MapStyleHelper.getNumberValue(styleConfig.pointSize, MapStyleHelper.DEFAULT_SYMBOL_SIZE);
    const geom = feature?.getGeometry();
    const label = MapStyleHelper.replaceSpecialValues(styleConfig.label, geom);
    const labelSize = MapStyleHelper.getNumberValue(styleConfig.labelSize, MapStyleHelper.DEFAULT_SYMBOL_SIZE);
    const scale = 1 + (labelSize / MapStyleHelper.DEFAULT_FONT_SIZE);
    const offsetY = styleConfig.pointType === 'label'
      ? 0
      : 14 + (symbolSize - MapStyleHelper.DEFAULT_SYMBOL_SIZE) + (scale * 2);

    const italic = (styleConfig.labelStyle || []).includes('italic');
    const bold = (styleConfig.labelStyle || []).includes('bold');
    const font = [
      italic ? 'italic' : undefined,
      bold ? 'bold' : undefined,
      '8px',
      'Inter, sans-serif',
    ].filter(Boolean).join(' ');

    const showSelectionRectangle = styleConfig.isSelected && !!styleConfig.pointType;
    const DEFAULT_SELECTION_PADDING = 10;
    const paddingTop: number = styleConfig.pointType === 'label'
      ? DEFAULT_SELECTION_PADDING
      : (styleConfig.pointType ? offsetY + symbolSize + DEFAULT_SELECTION_PADDING : 0);

    const baseLabelStyle = new Style({
      zIndex: styleConfig.zIndex,
      text: new Text({
        placement: GeometryTypeHelper.isLineGeometry(geom) ? 'line' : undefined,
        text: label,
        font,
        fill: new Fill({
          color: styleConfig.labelColor || MapStyleHelper.DEFAULT_LABEL_COLOR,
        }),
        rotation: MapStyleHelper.getRotationForDegrees(styleConfig.labelRotation),
        stroke: styleConfig.labelOutlineColor
          ? new Stroke({ color: styleConfig.labelOutlineColor, width: 2 })
          : undefined,
        offsetY,
        scale,
        backgroundStroke: showSelectionRectangle ? MapStyleHelper.getSelectionStroke(false) : undefined,
        padding: showSelectionRectangle
          ? [ paddingTop, DEFAULT_SELECTION_PADDING, DEFAULT_SELECTION_PADDING, DEFAULT_SELECTION_PADDING ]
          : undefined,
      }),
    });
    if (showSelectionRectangle) {
      const outerSelectionRectangle = baseLabelStyle.clone();
      outerSelectionRectangle.setZIndex(styleConfig.zIndex - 1);
      outerSelectionRectangle.getText().setBackgroundStroke(MapStyleHelper.getSelectionStroke(true));
      return [ baseLabelStyle, outerSelectionRectangle ];
    }
    return [baseLabelStyle];
  }

  private static replaceSpecialValues(label?: string, geometry?: Geometry) {
    label = label || '';
    if (label.indexOf('[COORDINATES]') !== -1) {
      const coordinatesLabel = GeometryTypeHelper.isPointGeometry(geometry) ? geometry.getCoordinates().join(' ') : '';
      label = label.replace(/\[COORDINATES]/g, coordinatesLabel);
    }
    if (label.indexOf('[LENGTH]') !== -1 || label.indexOf('[AREA]') !== -1) {
      label = label.replace(/\[(LENGTH|AREA)\]/g, MapSizeHelper.getFormattedSize(geometry));
    }
    return label;
  }

  private static createShape(type: MapStylePointType, styleConfig: MapStyleModel): Style[] {
    if (type === 'label') {
      return [];
    }
    const symbolSize = MapStyleHelper.getNumberValue(styleConfig.pointSize, MapStyleHelper.DEFAULT_SYMBOL_SIZE);
    const fillColor = styleConfig.pointFillColor || MapStyleHelper.DEFAULT_COLOR;
    const strokeColor = styleConfig.pointStrokeColor || MapStyleHelper.DEFAULT_COLOR;
    const strokeWidth = MapStyleHelper.getNumberValue(styleConfig.pointStrokeWidth, 1);
    if (type === 'cross' || type === 'arrow' || type === 'diamond') {
      const svgStrokeWidth = 1 + (strokeWidth / 10);
      const path = type === 'arrow'
        ? 'M0 6.75v-3.5h5.297V0L10 5l-4.703 5V6.75H0Z'
        : type === 'diamond'
          ? 'm5 0 3.5 4.997L5 10 1.5 4.997 5 0Z'
          : 'M7.026 3V.015h-4V3H.005v4h3.021v3.006h4V7h2.969V3H7.026Z';
      const icon = [
        `<svg width="10" height="10" viewBox="0 0 10 10" xmlns="http://www.w3.org/2000/svg">`,
        `<path d="${path}" fill="${fillColor}" stroke="${strokeColor}" stroke-width="${svgStrokeWidth}" />`,
        '</svg>',
      ].join('');
      return [
        new Style({
          image: new Icon({
            src: 'data:image/svg+xml;base64,' + btoa(icon),
            scale: (symbolSize + svgStrokeWidth) / 6,
            rotation: MapStyleHelper.getRotationForDegrees(styleConfig.pointRotation),
          }),
        }),
      ];
    }
    const POINT_SHAPES: Record<string, RegularShapeOptions> = {
      circle: { points: Infinity, radius: symbolSize },
      star: { points: 5, radius: symbolSize, radius2: symbolSize * .4, angle: 0 },
      square: { points: 4, radius: symbolSize, angle: Math.PI / 4 },
      triangle: { points: 3, radius: symbolSize, angle: 0 },
      diamond: { points: 4, radius: symbolSize, angle: Math.PI / 2 },
    };
    const baseShape = new RegularShape({
      fill: new Fill({ color:fillColor  }),
      stroke: strokeWidth === 0 || !strokeColor ? undefined : new Stroke({ color: strokeColor, width: strokeWidth }),
      rotation: MapStyleHelper.getRotationForDegrees(styleConfig.pointRotation),
      ...POINT_SHAPES[type],
    });
    return [new Style({ image: baseShape })];
  }

  private static createBuffer(feature: Feature<Geometry>, buffer: number, config: MapStyleModel) {
    const geometry = feature.getGeometry();
    if (!geometry) {
      return [];
    }
    const parser = new OL3Parser();
    parser.inject(
      Point,
      LineString,
      LinearRing,
      Polygon,
      MultiPoint,
      MultiLineString,
      MultiPolygon,
      Circle,
    );
    const jstsGeom = parser.read(GeometryTypeHelper.isCircleGeometry(geometry) ? fromCircle(geometry, 50) : geometry);
    const buffered = BufferOp.bufferOp(jstsGeom, buffer);
    const bufferedGeometry: Geometry = parser.write(buffered);

    const bufferStyle = new Style({
      geometry: bufferedGeometry,
    });
    const fill = MapStyleHelper.createFill(config, MapStyleHelper.getOpacity(config.fillOpacity, true));
    if (fill) {
      bufferStyle.setFill(fill);
    }
    const stroke = MapStyleHelper.createStroke(config, MapStyleHelper.getOpacity(config.strokeOpacity, true));
    if (stroke) {
      bufferStyle.setStroke(stroke);
    }
    return [bufferStyle];
  }

  private static getOpacity(opacity: number | undefined, hasBuffer?: boolean) {
    return Math.max(0, (opacity || 100) - (hasBuffer ? MapStyleHelper.BUFFER_OPACITY_DECREASE : 0));
  }

  private static createOutlinedSelectionRectangle(feature: Feature<Geometry>, buffer: number, translate?: number[]): Style[] {
    const outer: Style | null = MapStyleHelper.createSelectionRectangle(feature, buffer, translate);
    if (!outer) {
      return [];
    }
    const inner = outer.clone();
    outer.setStroke(MapStyleHelper.getSelectionStroke(true));
    inner.setStroke(MapStyleHelper.getSelectionStroke(false));
    return [
      outer,
      inner,
    ];
  }

  private static createSelectionRectangle(feature: Feature<Geometry>, buffer: number, translate?: number[]) {
    const geometry = feature.getGeometry();
    if (!geometry) {
      return null;
    }
    const extent = geometry.getExtent();
    const bufferedExtent = bufferExtent(extent, buffer);
    const rect = new Polygon([[
      [ bufferedExtent[0], bufferedExtent[1] ],
      [ bufferedExtent[0], bufferedExtent[3] ],
      [ bufferedExtent[2], bufferedExtent[3] ],
      [ bufferedExtent[2], bufferedExtent[1] ],
      [ bufferedExtent[0], bufferedExtent[1] ],
    ]]);
    if (translate) {
      rect.translate(translate[0], translate[1]);
    }
    return new Style({
      geometry: rect,
      stroke: MapStyleHelper.getSelectionStroke(),
      zIndex: Infinity,
    });
  }

  private static getSelectionStroke(outer = false) {
    return new Stroke({
      color: outer ? '#fff' : '#333',
      lineCap: 'square',
      lineDash: [ 4, 10 ],
      width: outer ? 5 : 2.5,
    });
  }

  private static getNumberValue(nr: number | undefined, defaultValue: number): number {
    if (typeof nr === 'undefined') {
      return defaultValue;
    }
    return nr;
  }

  private static getRotationForDegrees(degrees?: number): number {
    if (!degrees) {
      return degrees || 0;
    }
    return degrees / (180 / Math.PI);
  }

  private static createArrowStyles(styleConfig: MapStyleModel, feature?: Feature<Geometry>, strokeStyle?: Stroke): Style[] {
    if (!feature
      || !strokeStyle
      || !styleConfig.arrowType
      || styleConfig.arrowType === 'none'
    ) {
      return [];
    }
    const geometry = feature.getGeometry();
    if (!geometry || !GeometryTypeHelper.isLineGeometry(geometry)) {
      return [];
    }
    const arrows = [];
    const flatCoords = geometry.getFlatCoordinates();
    let lastSegment: [ number[], number[] ] | [] = [];
    forEachSegments(flatCoords, 0, flatCoords.length, geometry.getStride(), (start, end) => {
      if (lastSegment.length === 0
        && (styleConfig.arrowType === 'start' || styleConfig.arrowType === 'both')) {
        arrows.push(MapStyleHelper.createArrow({
          zIndex: styleConfig.zIndex,
          arrowStart: end,
          arrowEnd: start,
          strokeStyle,
          styleConfig,
        }));
      }
      if (styleConfig.arrowType === 'along') {
        const x = (start[0] + end[0]) / 2;
        const y = (start[1] + end[1]) / 2;
        arrows.push(MapStyleHelper.createArrow({
          zIndex: styleConfig.zIndex,
          arrowStart: start,
          arrowEnd: end,
          strokeStyle,
          pointCoordinates: [ x, y ],
          styleConfig,
        }));
      }
      lastSegment = [[...start], [...end]];
    });
    if (lastSegment.length !== 0
      && (
        styleConfig.arrowType === 'end'
        || styleConfig.arrowType === 'both'
        || styleConfig.arrowType === 'along'
      )) {
      arrows.push(MapStyleHelper.createArrow({
        zIndex: styleConfig.zIndex,
        arrowStart: lastSegment[0],
        arrowEnd: lastSegment[1],
        strokeStyle,
        styleConfig,
      }));
    }
    return arrows;
  }

  private static createArrow(args: {
    zIndex: number;
    arrowStart: number[];
    arrowEnd: number[];
    strokeStyle: Stroke;
    pointCoordinates?: number[];
    styleConfig: MapStyleModel;
  }): Style {
    const dx = args.arrowEnd[0] - args.arrowStart[0];
    const dy = args.arrowEnd[1] - args.arrowStart[1];
    const arrowAngle  = Math.atan2(dy, dx);
    return new Style({
      geometry: new Point(args.pointCoordinates || args.arrowEnd),
      image: new RegularShape({
        fill: new Fill({ color: args.strokeStyle.getColor() }),
        // stroke: outlineStroke,
        points: 3,
        radius: Math.max(1, args.strokeStyle.getWidth() || 1) + 5,
        angle: Math.PI / 2,
        rotation: -arrowAngle,
      }),
      zIndex: args.zIndex + 1,
    });
  }

  private static createFillPattern(color: string, opacity?: number) {
    const canvas = document.createElement('canvas');
    canvas.width = 50;
    canvas.height = 50;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return undefined;
    }

    ctx.strokeStyle = ColorHelper.getRgbStyleForColor(color, opacity);
    ctx.lineWidth = 20;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(50, 50);
    ctx.moveTo(-50, 0);
    ctx.lineTo(50, 50 * 2);
    ctx.moveTo(0, -50);
    ctx.lineTo(50 * 2, 50);
    ctx.stroke();

    ctx.strokeStyle = ColorHelper.getRgbStyleForColor(color, (opacity || 100) * .75);
    ctx.lineWidth = 15;
    ctx.beginPath();
    ctx.moveTo(-15, 10);
    ctx.lineTo(40, 65);
    ctx.moveTo(10, -15);
    ctx.lineTo(65, 40);
    ctx.stroke();

    const patternCanvas = document.createElement('canvas');
    return patternCanvas.getContext('2d')?.createPattern(canvas, 'repeat');
  }

}
