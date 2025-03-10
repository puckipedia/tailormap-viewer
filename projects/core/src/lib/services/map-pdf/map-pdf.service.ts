import { Inject, Injectable, LOCALE_ID } from '@angular/core';
import { concatMap, forkJoin, from, map, Observable, of, tap } from 'rxjs';
import { LayerModel, MapService, OlLayerFilter, OpenlayersExtent } from '@tailormap-viewer/map';
import { HttpClient } from '@angular/common/http';
import { IconService } from '@tailormap-viewer/shared';
import type { jsPDF } from 'jspdf';
import type { Svg2pdfOptions } from 'svg2pdf.js';
import { LegendService } from '../../components/legend/services/legend.service';
import { ResolvedServerType } from '@tailormap-viewer/api';
import { ApplicationMapService } from '../../map/services/application-map.service';
import { ExtendedAppLayerModel } from '../../map/models';

interface Size {
  width: number;
  height: number;
}

// Sizes in millimeters. Default is landscape
const a4Size: Size = { width: 297, height: 210 };
const a3Size: Size = { width: 420, height: 297 };

interface PrintOptions {
  title?: string;
  footer?: string;
  showLegend?: boolean;
  showWindrose?: boolean;
  showScale?: boolean;
  orientation?: 'portrait' | 'landscape';
  size: 'a3' | 'a4';
  mapExtent?: OpenlayersExtent | null; // Must be in ISO standard paper width/height ratio of Math.sqrt(2) (depending on orientation)!
  dpi?: number;
  filename?: string;
  autoPrint?: boolean;
}

@Injectable({
  providedIn: 'root',
})
export class MapPdfService {

  private readonly defaultMargin = 8;
  private readonly titleSize = 12;
  private readonly defaultFontSize = 8;

  constructor(
    private mapService: MapService,
    @Inject(LOCALE_ID) private locale: string,
    private httpClient: HttpClient,
    private iconService: IconService,
    private legendService: LegendService,
    private applicationMapService: ApplicationMapService,
  ) { }

  public create$(
    printOptions: PrintOptions,
    layers: Array<ExtendedAppLayerModel>,
    legendLayers$: Observable<ExtendedAppLayerModel[]>,
    vectorLayerFilter?: OlLayerFilter,
  ): Observable<string> {
    let size = printOptions.size === 'a3' ? a3Size : a4Size;
    if (printOptions.orientation === 'portrait') {
      // noinspection JSSuspiciousNameCombination
      size = { width: size.height, height: size.width };
    }
    // Map extent assumed to be in width/height ratio of ISO standard paper sizes depending on orientation: Math.sqrt(2)
    // When different layouts are added in the future with a different map image width/height ratio, the map preview width/height ratio must
    // be kept the same as the image ratio used in the layout.
    const mapSize = {
      width: size.width - (2 * this.defaultMargin),
      height: size.height - (2 * this.defaultMargin),
    };
    if (printOptions.title) {
      mapSize.height -= 2;
    }

    return from(import('jspdf'))
      .pipe(
        map(m => m.jsPDF),
        concatMap(jsPdfImport => forkJoin([ of(jsPdfImport), from(import('svg2pdf.js')) ])),
        concatMap(([jsPdfImport]) => {
          return this.createPdfDoc$(
            jsPdfImport,
            printOptions,
            size,
            mapSize,
            layers,
            legendLayers$,
            vectorLayerFilter,
          );
        }),
      );
  }

  private createPdfDoc$(
    pdfCreator: typeof jsPDF,
    printOptions: PrintOptions,
    size: Size,
    mapSize: Size,
    layers: Array<ExtendedAppLayerModel>,
    legendLayers$: Observable<ExtendedAppLayerModel[]>,
    vectorLayerFilter?: OlLayerFilter,
  ) {
    const doc = new pdfCreator({
      format: printOptions.size,
      orientation: printOptions.orientation || 'landscape',
    });
    doc.setFontSize(this.defaultFontSize);
    doc.setFont('helvetica');

    const x = this.defaultMargin;
    let y = this.defaultMargin;
    if (printOptions.title) {
      doc.setFontSize(this.titleSize);
      doc.text(printOptions.title, x, y);
      doc.setFontSize(this.defaultFontSize);
      y += 2;
    }
    if (printOptions.footer) {
      doc.setFontSize(8);
      doc.text(printOptions.footer, x, size.height - 5);
      doc.setFontSize(this.defaultFontSize);
    }
    this.addDateTime(doc, size.width, size.height);

    if (printOptions.autoPrint) {
      doc.autoPrint();
    }
    return this.addMapImage$(doc, x, y, mapSize, printOptions.mapExtent || null, printOptions.dpi || 72, layers, vectorLayerFilter).pipe(
      concatMap(() => this.addLegendImages$(doc, size.width, size.height, legendLayers$)),
      concatMap(() => this.addSvg2PDF$(doc, this.iconService.getUrlForIcon('logo'), { x: size.width - 30, y, width: 20, height: 20 })),
      concatMap(() => this.addSvg2PDF$(doc, this.iconService.getUrlForIcon('north_arrow'), { x, y: y + 2, width: 20, height: 20 })),
      map(() => doc.output('dataurlstring', { filename: printOptions.filename || $localize `map.pdf` })),
    );
  }

  private addLegendImages$(doc: jsPDF, width: number, height: number, layers$: Observable<Array<ExtendedAppLayerModel>>) {
    const legendDpiByLayer = new Map<ExtendedAppLayerModel, number>();

    const legendURLCallback = (layer: ExtendedAppLayerModel, url: URL) => {
      legendDpiByLayer.set(layer, 90);

      if (layer.service?.resolvedServerType === ResolvedServerType.GEOSERVER && LegendService.isGetLegendGraphicRequest(url.toString())) {
        // Use LEGEND_OPTIONS vendor specific Geoserver parameter, see https://docs.geoserver.org/stable/en/user/services/wms/get_legend_graphic/index.html
        const dpi = 180;
        legendDpiByLayer.set(layer, dpi);
        url.searchParams.set('LEGEND_OPTIONS', `dpi:${dpi};fontAntiAliasing:true;labelMargin:0;columnheight:300`);
      }
    };

    return this.legendService.getLegendImages$(layers$, legendURLCallback).pipe(
      tap(legendImages => {
        legendImages.forEach(legendImage => {
          if (legendImage.imageData != null) {
            // XXX put legend images on top of each other for now, more complex layout to be implemented later
            const dpi = legendDpiByLayer.get(legendImage.appLayer) || 90;
            const extraShrinkFactor = 1.25;
            const widthMm = legendImage.width / (dpi / 25.4) / extraShrinkFactor; // 1 inch is 25.4 mm
            const heightMm = legendImage.height / (dpi / 25.4) / extraShrinkFactor;
            const x = width - widthMm - 10;
            const y = height - heightMm - 10;
            doc.addImage(legendImage.imageData, 'PNG', x, y, widthMm, heightMm, '', 'FAST');
            doc.setDrawColor(0);
            doc.rect(x, y, widthMm, heightMm, 'S');
          }
        });
      }),
    );
  }

  private addSvg2PDF$(doc: jsPDF, url: string, options: Svg2pdfOptions): Observable<jsPDF> {
    return this.httpClient.get(url, { responseType: 'text' }).pipe(
      concatMap(svg => {
        const element = document.createElement('div');
        element.innerHTML = svg;
        return doc.svg(element.firstChild as HTMLElement, options);
      }),
    );
  }

  private addMapImage$(doc: jsPDF, x: number, y: number, mapSize: Size, extent: OpenlayersExtent | null, dpi: number,
                       layersWithService: Array<ExtendedAppLayerModel>, vectorLayerFilter?: OlLayerFilter): Observable<string> {
    const isValidLayer = (layer: LayerModel | null): layer is LayerModel => layer !== null;
    return forkJoin(layersWithService.map(layer => this.applicationMapService.convertAppLayerToMapLayer$(layer))).pipe(
      map(layers => layers.filter(isValidLayer)),
      concatMap(layers => this.mapService.exportMapImage$({ widthInMm: mapSize.width, heightInMm: mapSize.height, extent, dpi, layers, vectorLayerFilter })),
      tap(dataURL => {
        // Note: calling addImage() with a HTMLCanvasElement is actually slower than adding by PNG
        doc.addImage(dataURL, 'PNG', x, y, mapSize.width, mapSize.height, '', 'FAST');
      }),
    );
  }

  private addDateTime(doc: jsPDF, width: number, height: number) {
    const text = $localize `Created on `;
    const date = text + new Intl.DateTimeFormat(this.locale, { dateStyle: 'full', timeStyle: 'medium' }).format(new Date());
    const dateFontSize = 8;
    doc.setFontSize(dateFontSize);
    // See http://raw.githack.com/MrRio/jsPDF/master/docs/module-split_text_to_size.html#~getStringUnitWidth
    const dateWidthInMM = (doc.getStringUnitWidth(date) * dateFontSize) / (72 / 25.6);
    doc.text(date, width - dateWidthInMM - 8, height - 5);
    doc.setFontSize(this.defaultFontSize);
  }
}
