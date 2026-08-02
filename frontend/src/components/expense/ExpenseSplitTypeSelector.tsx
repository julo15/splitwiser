import React from 'react';
import SplitTypePills from './SplitTypePills';
import type { SplitType } from '../../types/expense';

interface ExpenseSplitTypeSelectorProps {
    value: SplitType;
    onChange: (type: SplitType) => void;
}

/**
 * Thin adapter kept so existing call sites (add-expense, expense detail) do not
 * each have to know about the pill row.
 */
const ExpenseSplitTypeSelector: React.FC<ExpenseSplitTypeSelectorProps> = ({
    value,
    onChange,
}) => (
    <SplitTypePills value={value} onChange={onChange} className="mb-2" />
);

export default ExpenseSplitTypeSelector;
