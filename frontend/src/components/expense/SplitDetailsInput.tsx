import React from 'react';
import type { Participant } from '../../types/expense';
import { getParticipantKey } from '../../utils/participantHelpers';

interface SplitDetailsInputProps {
    splitType: 'EXACT' | 'PERCENT' | 'SHARES';
    participants: Participant[];
    splitDetails: { [key: string]: number };
    onChange: (key: string, value: string) => void;
    currency: string;
    getParticipantName: (p: Participant) => string;
}

const SplitDetailsInput: React.FC<SplitDetailsInputProps> = ({
    splitType,
    participants,
    splitDetails,
    onChange,
    currency,
    getParticipantName
}) => {
    const getUnitLabel = () => {
        switch (splitType) {
            case 'PERCENT':
                return '%';
            case 'SHARES':
                return 'shares';
            case 'EXACT':
                return currency;
        }
    };

    return (
        <div className="bg-sw-sunk rounded-sw-row p-3 flex flex-col gap-3">
            {participants.map(p => {
                const key = getParticipantKey(p);
                return (
                    <div key={key} className="flex items-center justify-between gap-3">
                        <span className="text-sm flex-1 min-w-0 truncate">
                            {getParticipantName(p)}
                        </span>
                        <div className="flex items-center gap-2 flex-none">
                            <input
                                type="text"
                                inputMode="decimal"
                                aria-label={`${getParticipantName(p)} ${getUnitLabel()}`}
                                className="sw-num w-24 min-h-[44px] p-2 text-sm text-right rounded-lg bg-sw-surface text-sw-text border border-sw-line placeholder:text-sw-dim focus-visible:outline-2 focus-visible:outline-sw-accent focus-visible:outline-offset-2"
                                placeholder="0"
                                value={splitDetails[key] || ''}
                                onChange={(e) => onChange(key, e.target.value)}
                            />
                            <span className="text-sm text-sw-dim w-16">
                                {getUnitLabel()}
                            </span>
                        </div>
                    </div>
                );
            })}
        </div>
    );
};

export default SplitDetailsInput;
