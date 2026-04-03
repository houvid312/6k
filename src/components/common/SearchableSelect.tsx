import React, { useState, useMemo } from 'react';
import { View, StyleSheet, FlatList } from 'react-native';
import { Button, Text, TextInput, Portal, Modal, TouchableRipple, useTheme } from 'react-native-paper';

export interface SelectOption {
  value: string;
  label: string;
  subtitle?: string;
}

interface Props {
  options: SelectOption[];
  selectedValue?: string;
  placeholder?: string;
  icon?: string;
  onSelect: (value: string) => void;
}

export function SearchableSelect({ options, selectedValue, placeholder = 'Seleccionar', icon, onSelect }: Props) {
  const theme = useTheme();
  const [visible, setVisible] = useState(false);
  const [search, setSearch] = useState('');

  const selectedLabel = options.find((o) => o.value === selectedValue)?.label;

  const filtered = useMemo(() => {
    if (!search.trim()) return options;
    const q = search.toLowerCase().trim();
    return options.filter(
      (o) => o.label.toLowerCase().includes(q) || (o.subtitle?.toLowerCase().includes(q) ?? false),
    );
  }, [options, search]);

  const handleSelect = (value: string) => {
    onSelect(value);
    setVisible(false);
    setSearch('');
  };

  return (
    <>
      <Button
        mode="outlined"
        onPress={() => setVisible(true)}
        icon={icon}
        style={styles.trigger}
        contentStyle={{ justifyContent: 'flex-start' }}
      >
        {selectedLabel ?? placeholder}
      </Button>

      <Portal>
        <Modal
          visible={visible}
          onDismiss={() => { setVisible(false); setSearch(''); }}
          contentContainerStyle={[styles.modal, { backgroundColor: '#1E1E1E' }]}
        >
          <TextInput
            placeholder="Buscar..."
            value={search}
            onChangeText={setSearch}
            mode="outlined"
            dense
            autoFocus
            style={styles.searchInput}
            outlineColor="#333"
            activeOutlineColor="#E63946"
            textColor="#F5F0EB"
            placeholderTextColor="#666"
            left={<TextInput.Icon icon="magnify" color="#666" />}
            right={search ? <TextInput.Icon icon="close" color="#666" onPress={() => setSearch('')} /> : undefined}
          />

          {filtered.length === 0 ? (
            <Text variant="bodyMedium" style={{ color: '#666', textAlign: 'center', padding: 20 }}>
              Sin resultados
            </Text>
          ) : (
            <FlatList
              data={filtered}
              keyExtractor={(item) => item.value}
              style={styles.list}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <TouchableRipple
                  onPress={() => handleSelect(item.value)}
                  style={[
                    styles.option,
                    item.value === selectedValue && { backgroundColor: '#2A2A2A' },
                  ]}
                >
                  <View>
                    <Text
                      variant="bodyMedium"
                      style={{
                        color: '#F5F0EB',
                        fontWeight: item.value === selectedValue ? '700' : '400',
                      }}
                    >
                      {item.label}
                    </Text>
                    {item.subtitle && (
                      <Text variant="bodySmall" style={{ color: '#999' }}>
                        {item.subtitle}
                      </Text>
                    )}
                  </View>
                </TouchableRipple>
              )}
            />
          )}
        </Modal>
      </Portal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    marginBottom: 12,
  },
  modal: {
    margin: 20,
    borderRadius: 12,
    maxHeight: '70%',
    overflow: 'hidden',
  },
  searchInput: {
    margin: 12,
    marginBottom: 4,
    backgroundColor: '#111',
  },
  list: {
    maxHeight: 400,
  },
  option: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#333',
  },
});
