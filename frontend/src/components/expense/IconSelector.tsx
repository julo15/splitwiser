import React, { useState } from 'react';
import { X } from '@phosphor-icons/react';
import { Button } from '../ui';

interface IconSelectorProps {
    selectedIcon: string | null;
    onIconSelect: (icon: string | null) => void;
}

interface IconCategory {
    name: string;
    icons: string[];
}

// Icons organized by category
const ICON_CATEGORIES: IconCategory[] = [
    {
        name: 'Food & Drink',
        icons: ['🍔', '🍕', '🍜', '🍱', '🍣', '🥗', '🥪', '🌮', '🌯', '🍝', '🍛', '🍲', '☕', '🍺', '🍷', '🥤']
    },
    {
        name: 'Transportation',
        icons: ['✈️', '🚗', '🚕', '🚙', '🚌', '🚇', '🚊', '🚲', '🛴', '🏍️', '⛽', '🚢', '🛩️', '🚠']
    },
    {
        name: 'Accommodation',
        icons: ['🏨', '🏠', '🏡', '🏢', '🏰', '⛺', '🏕️']
    },
    {
        name: 'Entertainment',
        icons: ['🎬', '🎮', '🎭', '🎪', '🎨', '🎵', '🎸', '🎹', '🎤', '🎧', '🎫', '🎟️', '🎉', '🎊', '🎈']
    },
    {
        name: 'Shopping',
        icons: ['🛒', '🛍️', '👕', '👔', '👗', '👠', '👟', '💄', '💍', '👜', '🎁', '📦']
    },
    {
        name: 'Health & Fitness',
        icons: ['🏥', '💊', '💉', '🏋️', '⚽', '🏀', '🎾', '🏊', '🧘', '🚴']
    },
    {
        name: 'Work & Education',
        icons: ['💼', '📊', '📈', '📝', '✏️', '📚', '🎓', '🖊️', '💻', '⌨️', '🖱️']
    },
    {
        name: 'Technology',
        icons: ['📱', '💻', '⌨️', '🖥️', '⌚', '📷', '📹', '🎮', '🖨️', '💾', '📡']
    },
    {
        name: 'Nature & Outdoors',
        icons: ['🌲', '🌳', '🌴', '🌵', '🌷', '🌸', '🌹', '🌻', '🌼', '🌽', '🌾', '🌿', '🍀', '🍁', '🍂', '🍃', '🏔️', '⛰️', '🗻', '🌋', '🏖️', '🏝️', '🌊', '🌅', '🌄', '🏜️']
    },
    {
        name: 'Other',
        icons: ['🌍', '🗺️', '🎪', '🎡', '🎢', '🎠', '💐', '🌸', '🌺', '🔧', '🔨', '🏗️']
    }
];

/**
 * The icon swatch: a 48px rounded square, ringed in the hairline colour and
 * switching to an accent ring plus ghost fill when it is the chosen one. Used
 * for the trigger, the "none" option, and every emoji in the grid, so the
 * selected state reads the same everywhere.
 */
const SWATCH_BASE =
    'w-12 h-12 rounded-sw-row flex items-center justify-center min-h-[44px] flex-shrink-0 cursor-pointer transition-colors focus-visible:outline-2 focus-visible:outline-sw-accent focus-visible:outline-offset-2';

const swatchClass = (selected: boolean) =>
    `${SWATCH_BASE} ${
        selected
            ? 'bg-sw-accent-ghost shadow-[0_0_0_1px_var(--sw-accent)]'
            : 'bg-sw-sunk shadow-[0_0_0_1px_var(--sw-line)] hover:bg-sw-raise'
    }`;

const IconSelector: React.FC<IconSelectorProps> = ({ selectedIcon, onIconSelect }) => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [customEmoji, setCustomEmoji] = useState('');

    const handleIconClick = (icon: string | null) => {
        onIconSelect(icon);
        setIsModalOpen(false);
    };

    return (
        <>
            {/* Icon Trigger Button */}
            <button
                type="button"
                onClick={() => setIsModalOpen(true)}
                className={`${swatchClass(false)} text-2xl`}
                title="Select icon"
                aria-label="Select icon"
            >
                {selectedIcon || <span className="text-sw-dim text-xl">+</span>}
            </button>

            {/* Modal */}
            {isModalOpen && (
                <div
                    className="fixed inset-0 bg-black/55 flex items-center justify-center z-50 p-4 font-sans"
                    onClick={() => setIsModalOpen(false)}
                >
                    <div
                        role="dialog"
                        aria-modal="true"
                        aria-label="Select an icon"
                        className="bg-sw-surface text-sw-text rounded-sw-card-lg shadow-[0_0_0_1px_var(--sw-line)] max-w-lg w-full max-h-[80vh] overflow-y-auto"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="sticky top-0 bg-sw-surface border-b border-sw-line p-4 flex justify-between items-center">
                            <h3 className="sw-heading text-[17px]">Select an icon</h3>
                            <button
                                type="button"
                                onClick={() => setIsModalOpen(false)}
                                aria-label="Close icon selector"
                                className="text-sw-dim hover:text-sw-text p-2 -mr-2 cursor-pointer focus-visible:outline-2 focus-visible:outline-sw-accent focus-visible:outline-offset-2 rounded-lg"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <div className="p-4">
                            {/* Quick Select Options */}
                            <div className="mb-5">
                                <h4 className="text-[11px] uppercase tracking-[0.09em] text-sw-dim mb-2">
                                    Options
                                </h4>
                                <div className="flex items-center gap-4">
                                    {/* None Option */}
                                    <div className="flex flex-col gap-1">
                                        <span className="text-[11.5px] text-sw-muted">None</span>
                                        <button
                                            type="button"
                                            onClick={() => handleIconClick(null)}
                                            className={swatchClass(selectedIcon === null)}
                                            title="No icon"
                                        >
                                            <span className="text-sw-dim text-xl">—</span>
                                        </button>
                                    </div>

                                    <div className="h-8 w-px bg-sw-line mx-2"></div>

                                    {/* Custom Input */}
                                    <div className="flex flex-col gap-1">
                                        <span className="text-[11.5px] text-sw-muted">Custom</span>
                                        <div className="flex gap-2 items-center">
                                            <input
                                                type="text"
                                                aria-label="Custom emoji"
                                                value={customEmoji}
                                                onChange={(e) => {
                                                    const val = e.target.value;
                                                    const chars = Array.from(val);
                                                    if (chars.length <= 1) {
                                                        setCustomEmoji(val);
                                                    } else {
                                                        setCustomEmoji(chars[0] || '');
                                                    }
                                                }}
                                                placeholder="?"
                                                className="w-12 h-12 text-center text-xl bg-sw-sunk text-sw-text border border-sw-line rounded-sw-row placeholder:text-sw-dim focus-visible:outline-2 focus-visible:outline-sw-accent focus-visible:outline-offset-2"
                                            />
                                            <Button
                                                variant="primary"
                                                onClick={() => customEmoji && handleIconClick(customEmoji)}
                                                disabled={!customEmoji}
                                                className="h-12 px-4"
                                            >
                                                Use
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Icon Categories */}
                            {ICON_CATEGORIES.map((category) => (
                                <div key={category.name} className="mb-4">
                                    <h4 className="text-[11px] uppercase tracking-[0.09em] text-sw-dim mb-2">
                                        {category.name}
                                    </h4>
                                    <div className="flex flex-wrap gap-2">
                                        {category.icons.map((icon) => (
                                            <button
                                                key={icon}
                                                type="button"
                                                onClick={() => handleIconClick(icon)}
                                                aria-label={`Select ${icon}`}
                                                className={`${swatchClass(selectedIcon === icon)} text-2xl`}
                                                title={icon}
                                            >
                                                {icon}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

export default IconSelector;
