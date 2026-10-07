import React, {useMemo} from 'react';
import {View} from 'react-native';
import Svg, {Rect} from 'react-native-svg';

type QrMaker = {
  addData: (data: string) => void;
  make: () => void;
  getModuleCount: () => number;
  isDark: (row: number, col: number) => boolean;
};

type QrFactory = (typeNumber: number, errorCorrectionLevel: 'L' | 'M' | 'Q' | 'H') => QrMaker;

function qrFactory(): QrFactory {
  const loaded = require('qrcode-generator') as QrFactory | {default: QrFactory};
  return typeof loaded === 'function' ? loaded : loaded.default;
}

type Props = {
  value: string;
  size?: number;
};

/** Renders the personal invite URL. The matrix is the link, not a download count. */
export default function InviteQrCode({value, size = 180}: Props) {
  const cells = useMemo(() => {
    const qr = qrFactory()(0, 'M');
    qr.addData(value);
    qr.make();
    const count = qr.getModuleCount();
    const dark: Array<{row: number; col: number}> = [];
    for (let row = 0; row < count; row += 1) {
      for (let col = 0; col < count; col += 1) {
        if (qr.isDark(row, col)) {
          dark.push({row, col});
        }
      }
    }
    return {count, dark};
  }, [value]);

  const cell = size / cells.count;

  return (
    <View accessibilityRole="image" testID="invite-qr">
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <Rect x={0} y={0} width={size} height={size} fill="#FFFFFF" />
        {cells.dark.map(item => (
          <Rect
            key={`${item.row}-${item.col}`}
            x={item.col * cell}
            y={item.row * cell}
            width={cell}
            height={cell}
            fill="#111111"
          />
        ))}
      </Svg>
    </View>
  );
}
