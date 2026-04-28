import React from 'react';

interface MarkdownRendererProps {
  content: string;
}

export function MarkdownRenderer({ content }: MarkdownRendererProps) {
  // Parsing super leve para não precisarmos de bibliotecas pesadas externas.
  // Trata Headers (###), Bold (**), Italic (*) e quebras de linha em parágrafos.
  
  const parseMarkdown = (text: string) => {
    // Separa por blocos/parágrafos
    const blocks = text.split('\n').filter(b => b.trim() !== '');

    return blocks.map((block, index) => {
      // É um cabeçalho H3 (### Titulo)
      if (block.startsWith('### ')) {
        return <h3 key={index} className="text-lg font-bold mt-6 mb-3 text-textMain">{processInlines(block.replace('### ', ''))}</h3>;
      }
      
      // É um cabeçalho H2 (## Titulo)
      if (block.startsWith('## ')) {
        return <h2 key={index} className="text-xl font-bold mt-8 mb-4 text-primary border-b border-borderSubtle pb-2">{processInlines(block.replace('## ', ''))}</h2>;
      }
      
      // Lista com Bullet
      if (block.startsWith('* ') || block.startsWith('- ')) {
        return (
          <div key={index} className="flex gap-2 my-2 items-start">
            <span className="text-primary mt-1">•</span>
            <span className="flex-1 text-textMain leading-relaxed">{processInlines(block.slice(2))}</span>
          </div>
        );
      }
      
      // Lista Numerada (1. Tópico)
      const numMatch = block.match(/^(\d+)\.\s+(.*)/);
      if (numMatch) {
         return (
           <div key={index} className="flex gap-2 my-2 items-start">
             <span className="text-textMuted font-bold mt-0.5">{numMatch[1]}.</span>
             <span className="flex-1 text-textMain leading-relaxed">{processInlines(numMatch[2])}</span>
           </div>
         );
      }

      // Parágrafo Normal
      return <p key={index} className="mb-4 text-textMain leading-relaxed">{processInlines(block)}</p>;
    });
  };

  const processInlines = (text: string) => {
    // Transformar **negrito** em <strong>
    const parts = text.split(/(\*\*.*?\*\*|\*[^*]+\*)/g);
    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={i} className="font-bold text-textMain">{part.slice(2, -2)}</strong>;
      }
      if (part.startsWith('*') && part.endsWith('*')) {
        return <em key={i} className="italic">{part.slice(1, -1)}</em>;
      }
      return <React.Fragment key={i}>{part}</React.Fragment>;
    });
  };

  return <div className="space-y-1">{parseMarkdown(content)}</div>;
}
