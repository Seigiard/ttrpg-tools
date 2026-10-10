const russian = new Intl.PluralRules('ru');

export type RussianForms = { one: string; few: string; many: string };

export function pluralRu(count: number, forms: RussianForms): string {
  const category = russian.select(count);

  return `${count} ${category === 'one' || category === 'few' ? forms[category] : forms.many}`;
}
