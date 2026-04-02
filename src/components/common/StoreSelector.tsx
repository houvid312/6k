import React, { useState } from 'react';
import { Chip, Menu } from 'react-native-paper';
import { useAppStore } from '../../stores';
import { MaterialCommunityIcons } from '@expo/vector-icons';

export function StoreSelector() {
  const { selectedStoreId, stores, setSelectedStore } = useAppStore();
  const [visible, setVisible] = useState(false);

  const selectedStore = stores.find((s) => s.id === selectedStoreId);

  return (
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
      {stores.map((store) => (
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
  );
}
