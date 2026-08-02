import React, { useMemo } from 'react';
import qrcode from 'qrcode-generator';

export interface QrCodeProps {
    value: string;
    /** Rendered size in px. The SVG scales, so this is presentation only. */
    size?: number;
    /** Quiet zone in modules. The spec asks for 4; anything less misreads. */
    margin?: number;
    className?: string;
}

/**
 * A QR for the tab's share link.
 *
 * Drawn as one <path> rather than a rect per module: a 29×29 code is 841 nodes
 * otherwise, and this is re-rendered behind a live poll.
 *
 * Fixed black-on-white in both themes. A QR is a thing to be photographed by
 * other people's phones, and scanners want the contrast the spec assumes — a
 * dark-mode inversion reads slowly or not at all on older cameras.
 */
const QrCode: React.FC<QrCodeProps> = ({
    value,
    size = 200,
    margin = 4,
    className = '',
}) => {
    const { path, extent } = useMemo(() => {
        // Type 0 lets the library pick the smallest version that fits; 'M'
        // tolerates ~15% damage, which is right for a screen someone is
        // photographing at an angle across a table.
        const code = qrcode(0, 'M');
        code.addData(value);
        code.make();

        const count = code.getModuleCount();
        const parts: string[] = [];
        for (let row = 0; row < count; row++) {
            for (let column = 0; column < count; column++) {
                if (code.isDark(row, column)) {
                    parts.push(`M${column + margin} ${row + margin}h1v1h-1z`);
                }
            }
        }
        return { path: parts.join(''), extent: count + margin * 2 };
    }, [value, margin]);

    return (
        <svg
            viewBox={`0 0 ${extent} ${extent}`}
            width={size}
            height={size}
            role="img"
            aria-label="QR code for the tab link"
            shapeRendering="crispEdges"
            className={`rounded-md ${className}`.trim()}
        >
            <rect width={extent} height={extent} fill="#ffffff" />
            <path d={path} fill="#000000" />
        </svg>
    );
};

export default QrCode;
