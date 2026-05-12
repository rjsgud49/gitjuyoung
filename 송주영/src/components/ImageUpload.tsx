import { useRef, useState } from 'react';
import type { GachaItem } from '../types';
import styles from '../styles/ImageUpload.module.css';

interface ImageUploadProps {
  onItemsAdded: (items: GachaItem[]) => void;
}

export const ImageUpload: React.FC<ImageUploadProps> = ({ onItemsAdded }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [newItems, setNewItems] = useState<
    Array<{
      name: string;
      image: string;
      rarity: 'common' | 'rare' | 'epic' | 'legendary';
      probability: number;
    }>
  >([]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.currentTarget.files;
    if (!files) return;

    setIsLoading(true);
    const items: typeof newItems = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const reader = new FileReader();

      reader.onload = (event) => {
        if (event.target?.result) {
          const filename = file.name.split('.')[0];
          items.push({
            name: filename,
            image: event.target.result as string,
            rarity: 'common',
            probability: 0.5,
          });

          if (items.length === files.length) {
            setNewItems(items);
            setIsLoading(false);
          }
        }
      };

      reader.readAsDataURL(file);
    }
  };

  const handleAddItems = () => {
    if (newItems.length === 0) return;

    const gachaItems: GachaItem[] = newItems.map((item, index) => ({
      id: `item-${Date.now()}-${index}`,
      ...item,
    }));

    onItemsAdded(gachaItems);
    setNewItems([]);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleUpdateItem = (
    index: number,
    field: keyof (typeof newItems)[0],
    value: any
  ) => {
    const updated = [...newItems];
    (updated[index] as any)[field] = value;
    setNewItems(updated);
  };

  const handleRemoveItem = (index: number) => {
    setNewItems(newItems.filter((_, i) => i !== index));
  };

  return (
    <div className={styles.uploadContainer}>
      <h2>🖼️ 아이템 추가</h2>

      <div className={styles.uploadArea}>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*"
          onChange={handleFileSelect}
          className={styles.fileInput}
          disabled={isLoading}
        />
        <label className={styles.uploadLabel}>
          <div className={styles.uploadIcon}>📁</div>
          <p>이미지를 선택하거나 드래그하세요</p>
          <small>최대 여러 개 파일 선택 가능</small>
        </label>
      </div>

      {newItems.length > 0 && (
        <div className={styles.itemsList}>
          <h3>추가할 아이템 ({newItems.length})</h3>

          {newItems.map((item, index) => (
            <div key={index} className={styles.itemForm}>
              <div className={styles.preview}>
                <img src={item.image} alt={item.name} />
              </div>

              <div className={styles.fields}>
                <input
                  type="text"
                  placeholder="아이템 이름"
                  value={item.name}
                  onChange={(e) =>
                    handleUpdateItem(index, 'name', e.target.value)
                  }
                  className={styles.input}
                />

                <select
                  value={item.rarity}
                  onChange={(e) =>
                    handleUpdateItem(
                      index,
                      'rarity',
                      e.target.value as any
                    )
                  }
                  className={styles.select}
                >
                  <option value="common">일반</option>
                  <option value="rare">레어</option>
                  <option value="epic">에픽</option>
                  <option value="legendary">전설</option>
                </select>

                <div className={styles.probabilityControl}>
                  <label>확률: {(item.probability * 100).toFixed(0)}%</label>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={item.probability}
                    onChange={(e) =>
                      handleUpdateItem(
                        index,
                        'probability',
                        parseFloat(e.target.value)
                      )
                    }
                    className={styles.slider}
                  />
                </div>
              </div>

              <button
                onClick={() => handleRemoveItem(index)}
                className={styles.removeButton}
                title="제거"
              >
                ❌
              </button>
            </div>
          ))}

          <button
            onClick={handleAddItems}
            className={styles.submitButton}
            disabled={isLoading}
          >
            {isLoading ? '처리 중...' : '아이템 추가'}
          </button>
        </div>
      )}
    </div>
  );
};
