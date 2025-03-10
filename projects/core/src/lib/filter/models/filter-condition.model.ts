import { FeatureAttributeTypeEnum } from '@tailormap-viewer/api';
import { FilterConditionEnum } from './filter-condition.enum';

export interface FilterConditionModel {
  condition: FilterConditionEnum;
  label: string;
  attributeType: FeatureAttributeTypeEnum[];
  readableLabel: string;
}
