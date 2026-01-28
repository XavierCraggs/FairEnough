import React, { useMemo, useState } from 'react';
import { Pressable, StyleProp, TextStyle } from 'react-native';
import { Text } from '@/components/Themed';

interface ExpandableTitleProps {
  text: string;
  style?: StyleProp<TextStyle>;
  collapsedLines?: number;
  expandThreshold?: number;
  minimumFontScale?: number;
}

const ExpandableTitle: React.FC<ExpandableTitleProps> = ({
  text,
  style,
  collapsedLines = 1,
  expandThreshold = 28,
}) => {
  const [expanded, setExpanded] = useState(false);
  const trimmed = text?.trim() || '';
  const canExpand = trimmed.length > expandThreshold;
  const numberOfLines = useMemo(
    () => (canExpand && !expanded ? collapsedLines : undefined),
    [canExpand, expanded, collapsedLines]
  );

  return (
    <Pressable
      disabled={!canExpand}
      onPress={() => setExpanded((prev) => !prev)}
    >
      <Text
        style={style}
        numberOfLines={numberOfLines}
        ellipsizeMode="tail"
      >
        {trimmed || 'Untitled'}
      </Text>
    </Pressable>
  );
};

export default ExpandableTitle;
