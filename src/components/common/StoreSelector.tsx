import React, { useState, useEffect } from 'react';
import { View } from 'react-native';
import { Chip, Menu } from 'react-native-paper';
import { useIsFocused } from '@react-navigation/native';
import { useAppStore } from '../../stores';
import { MaterialCommunityIcons } from '@expo/vector-icons';

interface Props {
  excludeProductionCenter?: boolean;
}

export function StoreSelector({ excludeProductionCenter = false }: Props) {
  const { selectedStoreId, stores, setSelectedStore } = useAppStore();
  const [visible, setVisible] = useState(false);
  const isFocused = useIsFocused();

  const filteredStores = excludeProductionCenter
    ? stores.filter((s) => !s.isProductionCenter)
    : stores;

  // If current selection is excluded, auto-select the first available store
  // Only run when this screen is focused to avoid background tabs overriding the selection
  useEffect(() => {
    if (isFocused && excludeProductionCenter && filteredStores.length > 0) {
      const currentIsExcluded = !filteredStores.some((s) => s.id === selectedStoreId);
      if (currentIsExcluded) {
        setSelectedStore(filteredStores[0].id);
      }
    }
  }, [isFocused, excludeProductionCenter, filteredStores, selectedStoreId, setSelectedStore]);

  const selectedStore = stores.find((s) => s.id === selectedStoreId);

  return (
    <View style={{ zIndex: 1000, position: 'relative' }}>
    <Menu
      visible={visible}
      onDismiss={() => setVisible(false)}
      anchor={
        <Chip
          icon={() => <MaterialCommunityIcons name="store" size={18} color="#D32F2F" />}
          onPress={() => setVisible(true)}
          mode="outlined"
          compact
        >
          {selectedStore?.name ?? 'Seleccionar tienda'}
        </Chip>
      }
    >
      {filteredStores.map((store) => (
        <Menu.Item
          key={store.id}
          onPress={() => {
            setSelectedStore(store.id);
            setVisible(false);
          }}
          title={store.name}
          leadingIcon={store.id === selectedStoreId ? 'check' : undefined}
        />
      ))}
    </Menu>
    </View>
  );
}
