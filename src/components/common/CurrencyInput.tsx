import React, { useState, useCallback } from 'react';
import { TextInput } from 'react-native-paper';
import { formatCOP } from '../../utils/currency';

interface Props {
  value: number;
  onChangeValue: (n: number) => void;
  label?: string;
  style?: object;
}

export function CurrencyInput({ value, onChangeValue, label = 'Monto', style }: Props) {
  const [isFocused, setIsFocused] = useState(false);
  const [rawText, setRawText] = useState(value > 0 ? String(value) : '');

  const handleFocus = useCallback(() => {
    setIsFocused(true);
    setRawText(value > 0 ? String(value) : '');
  }, [value]);

  const handleBlur = useCallback(() => {
    setIsFocused(false);
    const parsed = parseInt(rawText, 10);
    if (!isNaN(parsed)) {
      onChangeValue(parsed);
    }
  }, [rawText, onChangeValue]);

  const handleChangeText = useCallback((text: string) => {
    const cleaned = text.replace(/[^0-9]/g, '');
    setRawText(cleaned);
    const parsed = parseInt(cleaned, 10);
    if (!isNaN(parsed)) {
      onChangeValue(parsed);
    } else {
      onChangeValue(0);
    }
  }, [onChangeValue]);

  return (
    <TextInput
      label={label}
      value={isFocused ? rawText : formatCOP(value)}
      onChangeText={handleChangeText}
      onFocus={handleFocus}
      onBlur={handleBlur}
      keyboardType="numeric"
      mode="outlined"
      left={<TextInput.Affix text="$" />}
      style={style}
    />
  );
}
