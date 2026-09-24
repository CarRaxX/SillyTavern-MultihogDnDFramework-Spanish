import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const guidanceFiles = [
    'README.md',
    'docs/multihogDnDdoc.md',
    'index.js',
    'renderer.js',
    'adventure-companion.js',
];

describe('model recommendation guidance', () => {
    it('keeps model guidance tentative across all active recommendation surfaces', () => {
        const onboarding = readFileSync(new URL('../renderer.js', import.meta.url), 'utf8');
        const lorebookHelp = readFileSync(new URL('../index.js', import.meta.url), 'utf8');

        expect(onboarding).toMatch(/(?:For the narrator, I'd recommend trying at least the following:|Para el narrador, recomendaría probar al menos los siguientes:)/);
        expect(onboarding).toMatch(/(?:Deepseek V4 Pro and latest Flash|Deepseek V4 Pro y Flash más reciente)/);
        expect(onboarding).toMatch(/(?:GPT-5\.6 Luna, for its great cost-efficiency\. Seems to be a decent model overall\.|GPT-5\.6 Luna, por su gran relación calidad-precio\. Parece ser un modelo bastante decente en general\.)/);
        expect(onboarding).toMatch(/(?:I've been recommending the Gemini Flash-Lite and Flash models\. However, now I'm not sure at all anymore\.|he estado recomendando los modelos Gemini Flash-Lite y Flash\. Sin embargo, ahora ya no estoy del todo seguro\.)/);
        expect(onboarding).toMatch(/(?:Deepseek V4 Flash 0731 recently came out and is very promising|Deepseek V4 Flash 0731 salió recientemente y es muy prometedor)/);
        expect(onboarding).toMatch(/(?:the same goes for GPT-5\.6 Luna|lo mismo ocurre con GPT-5\.6 Luna)/);
        expect(onboarding).toMatch(/(?:This way you can have a faster model, so combat is faster\.|De esta forma puedes tener un modelo más rápido para que el combate sea más ágil\.)/);
        expect(lorebookHelp).toMatch(/(?:I've been recommending Gemini Flash-Lite and Flash, but Deepseek V4 Flash 0731 and GPT-5\.6 Luna are also very promising|he estado recomendando Gemini Flash-Lite y Flash, pero Deepseek V4 Flash 0731 y GPT-5\.6 Luna también son muy prometedores)/);

        for (const filename of guidanceFiles) {
            const text = readFileSync(new URL(`../${filename}`, import.meta.url), 'utf8');
            expect(text).not.toContain('GPT-5.6 Luna is now the primary recommendation');
            expect(text).not.toContain('Gemini 3.5 Flash-Lite is probably still the best choice');
            expect(text).not.toContain('recommended tracker model Gemini 3.5 Flash-Lite');
        }

        const documentation = readFileSync(new URL('../docs/multihogDnDdoc.md', import.meta.url), 'utf8');
        expect(documentation).toMatch(/(?:For the narrator, I'd recommend trying at least the following:|Para el narrador, recomendaría probar al menos los siguientes:)/);
        expect(documentation).toMatch(/(?:- MiMo 2\.5 Pro|- MiMo 2\.5 Pro)/);
        expect(documentation).toMatch(/(?:- Deepseek V4 Pro and latest Flash|- Deepseek V4 Pro y Flash)/);
        expect(documentation).toMatch(/(?:- GPT-5\.6 Luna, for its great cost-efficiency\. Seems to be a decent model overall\.|- GPT-5\.6 Luna, por su gran relación calidad-precio)/);
        expect(documentation).toMatch(/(?:there is no firm recommendation yet|no hay una recomendación firme todavía)/);
    });
});
