import { useState, useEffect, useCallback } from 'react';
import type { CollectedItem } from '../types';
import { getRarityColor, getRarityLabel } from '../utils/gachaUtils';
import { fetchSynthesisRecipes, postCraftSynthesis } from '../api/gameApi';
import type { SynthesisRecipeApi } from '../api/gameApi';
import styles from '../styles/Synthesis.module.css';
import { photoUrlForDisplay } from '../utils/photoUrl';

interface Props {
  githubToken?: string;
  collectedItems: Map<string, CollectedItem>;
  onCollectedItemsChange: (fn: (prev: Map<string, CollectedItem>) => Map<string, CollectedItem>) => void;
}

export const Synthesis = ({ githubToken, collectedItems, onCollectedItemsChange }: Props) => {
  const [recipes, setRecipes] = useState<SynthesisRecipeApi[]>([]);
  const [loading, setLoading] = useState(true);
  const [crafting, setCrafting] = useState<string | null>(null);
  const [result, setResult] = useState<{ name: string; rarity: string; image: string } | null>(null);

  useEffect(() => {
    fetchSynthesisRecipes()
      .then(setRecipes)
      .catch(() => setRecipes([]))
      .finally(() => setLoading(false));
  }, []);

  const canCraft = useCallback((recipe: SynthesisRecipeApi) => {
    if (!githubToken) return false;
    return recipe.ingredients.every(ing => {
      const held = collectedItems.get(ing.itemId);
      return held && held.count >= ing.count;
    });
  }, [githubToken, collectedItems]);

  const handleCraft = useCallback(async (recipe: SynthesisRecipeApi) => {
    if (!githubToken || crafting) return;
    setCrafting(recipe.id);
    try {
      const res = await postCraftSynthesis(githubToken, recipe.id);
      // 재료 차감 반영
      onCollectedItemsChange(prev => {
        const next = new Map(prev);
        for (const ing of recipe.ingredients) {
          const item = next.get(ing.itemId);
          if (item) {
            if (item.count <= ing.count) next.delete(ing.itemId);
            else next.set(ing.itemId, { ...item, count: item.count - ing.count });
          }
        }
        // 결과 카드 추가
        const existing = next.get(res.resultItemId);
        if (existing) {
          next.set(res.resultItemId, { ...existing, count: existing.count + 1 });
        } else {
          next.set(res.resultItemId, {
            id: res.resultItemId,
            name: res.resultItemName,
            rarity: res.resultItemRarity as any,
            image: res.resultItemImage,
            probability: 0,
            count: 1,
            firstAcquiredAt: new Date(),
            individualValue: 0,
          });
        }
        return next;
      });
      setResult({ name: res.resultItemName, rarity: res.resultItemRarity, image: res.resultItemImage });
    } catch (e) {
      alert(`합성 실패: ${e instanceof Error ? e.message : e}`);
    } finally {
      setCrafting(null);
    }
  }, [githubToken, crafting, onCollectedItemsChange]);

  if (loading) return <div className={styles.loading}>레시피 불러오는 중…</div>;

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h2 className={styles.title}>⚗️ 카드 합성</h2>
        <p className={styles.subtitle}>재료 카드를 소모해 스페셜 카드를 만드세요</p>
      </div>

      {recipes.length === 0 ? (
        <div className={styles.empty}>등록된 합성 레시피가 없습니다</div>
      ) : (
        <div className={styles.recipeGrid}>
          {recipes.map(recipe => {
            const craftable = canCraft(recipe);
            return (
              <div
                key={recipe.id}
                className={`${styles.recipeCard} ${craftable ? styles.craftable : styles.notCraftable}`}
              >
                {/* 결과 카드 */}
                <div className={styles.resultSection}>
                  <div className={styles.resultLabel}>합성 결과</div>
                  <div
                    className={styles.resultCard}
                    style={{ '--rarity-color': getRarityColor(recipe.resultItemRarity) } as React.CSSProperties}
                  >
                    <div className={styles.resultGlow} />
                    <img
                      src={photoUrlForDisplay(recipe.resultItemImage)}
                      alt={recipe.resultItemName}
                      className={styles.resultImg}
                      onError={e => { (e.currentTarget as HTMLImageElement).src =
                        'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="80" height="80"%3E%3Crect fill="%23333" width="80" height="80"/%3E%3C/svg%3E'; }}
                    />
                    <div className={styles.resultName}>{recipe.resultItemName}</div>
                    <div
                      className={styles.resultRarity}
                      style={{ color: getRarityColor(recipe.resultItemRarity) }}
                    >
                      ✨ {getRarityLabel(recipe.resultItemRarity)}
                    </div>
                  </div>
                </div>

                <div className={styles.arrowSection}>⟵</div>

                {/* 재료 목록 */}
                <div className={styles.ingredientsSection}>
                  <div className={styles.ingredientsLabel}>필요 재료</div>
                  <div className={styles.ingredientList}>
                    {recipe.ingredients.map((ing, i) => {
                      const held = collectedItems.get(ing.itemId);
                      const heldCount = held?.count ?? 0;
                      const enough = heldCount >= ing.count;
                      return (
                        <div key={i} className={`${styles.ingredient} ${enough ? styles.ingHave : styles.ingMissing}`}>
                          {held?.image && (
                            <img src={photoUrlForDisplay(held.image)} alt={ing.itemName} className={styles.ingImg}
                              onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                          )}
                          <div className={styles.ingInfo}>
                            <div className={styles.ingName}>{ing.itemName}</div>
                            <div className={styles.ingCount}>
                              <span style={{ color: enough ? '#4ade80' : '#f87171' }}>{heldCount}</span>
                              <span className={styles.ingSlash}>/</span>
                              <span>{ing.count}</span>
                            </div>
                          </div>
                          <div className={styles.ingStatus}>{enough ? '✅' : '❌'}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <button
                  className={`${styles.craftBtn} ${!craftable ? styles.craftBtnDisabled : ''}`}
                  onClick={() => handleCraft(recipe)}
                  disabled={!craftable || crafting === recipe.id}
                >
                  {crafting === recipe.id ? '합성 중…' : craftable ? '⚗️ 합성하기' : '재료 부족'}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* 결과 모달 */}
      {result && (
        <div className={styles.resultOverlay} onClick={() => setResult(null)}>
          <div className={styles.resultModal} onClick={e => e.stopPropagation()}>
            <div className={styles.resultModalTitle}>✨ 합성 성공!</div>
            <div
              className={styles.resultModalCard}
              style={{ '--rarity-color': getRarityColor(result.rarity) } as React.CSSProperties}
            >
              <div className={styles.resultModalGlow} />
              <img src={photoUrlForDisplay(result.image)} alt={result.name} className={styles.resultModalImg}
                onError={e => { (e.currentTarget as HTMLImageElement).src =
                  'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="120" height="120"%3E%3Crect fill="%23333" width="120" height="120"/%3E%3C/svg%3E'; }}
              />
              <div className={styles.resultModalName}>{result.name}</div>
              <div className={styles.resultModalRarity} style={{ color: getRarityColor(result.rarity) }}>
                ✨ {getRarityLabel(result.rarity)}
              </div>
            </div>
            <button className={styles.resultCloseBtn} onClick={() => setResult(null)}>확인</button>
          </div>
        </div>
      )}
    </div>
  );
};
