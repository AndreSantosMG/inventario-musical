const utils = {
    generateCode: () => {
        const year = new Date().getFullYear();
        const random = Math.floor(10000 + Math.random() * 90000);
        return `FDSF-${year}-${random}`;
    },
    compressImage: (file, maxWidth = 400, maxHeight = 400, quality = 0.7) => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');
                    let width = img.width, height = img.height;
                    if (width > maxWidth) { height = (height * maxWidth) / width; width = maxWidth; }
                    if (height > maxHeight) { width = (width * maxHeight) / height; height = maxHeight; }
                    canvas.width = width; canvas.height = height;
                    ctx.drawImage(img, 0, 0, width, height);
                    resolve(canvas.toDataURL('image/jpeg', quality));
                };
                img.onerror = reject;
                img.src = e.target.result;
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    },
    generateId: () => 'inst_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
    
    // NOVO: Hash SHA-256 com salt fixo
    hashPassword: async (password) => {
        const salt = 'FDSF_INV_2026_SECURE_SALT';
        const data = new TextEncoder().encode(salt + password);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    },
    
    exportCSV: (items) => {
        const headers = ['Codigo', 'Patrimonio', 'Instituicao', 'Categoria', 'Descricao', 'Status', 'Responsavel', 'DataEntrada', 'Observacao'];
        const rows = items.map(i => [i.codigo, i.patrimonio || '', i.instituicaoNome || '', i.categoria, i.descricao, i.status, i.responsavel || '', i.dataEntrada, i.observacao || '']);
        const csvContent = "data:text/csv;charset=utf-8,\uFEFF" + [headers, ...rows].map(e => e.map(c => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\n");
        const link = document.createElement("a");
        link.setAttribute("href", encodeURI(csvContent));
        link.setAttribute("download", "inventario.csv");
        document.body.appendChild(link); link.click(); document.body.removeChild(link);
    },
    exportPDF: (items) => {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('landscape', 'mm', 'a4');
        doc.text("Relatório de Inventário", 14, 15);
        doc.autoTable({ head: [['Código', 'Patrimônio', 'Unidade', 'Categoria', 'Descrição', 'Status']], body: items.map(i => [i.codigo, i.patrimonio || '-', i.instituicaoNome || '', i.categoria, i.descricao, i.status]), startY: 20, styles: { fontSize: 8, cellPadding: 2 }, headStyles: { fillColor: [30, 58, 138], textColor: 255 } });
        doc.save("inventario.pdf");
    },
    exportCSVReport: (data, nomeArquivo) => {
        if (!data?.length) return;
        const headers = Object.keys(data[0]);
        const csvContent = "data:text/csv;charset=utf-8,\uFEFF" + [headers, ...data.map(item => headers.map(h => item[h] || ''))].map(e => e.map(c => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\n");
        const link = document.createElement("a");
        link.setAttribute("href", encodeURI(csvContent));
        link.setAttribute("download", `${nomeArquivo}.csv`);
        document.body.appendChild(link); link.click(); document.body.removeChild(link);
    },
    exportXLSX: (data, nomeArquivo, titulo, instituicao, dataGeracao, usuario, logo = null) => {
        if (typeof XLSX === 'undefined') { alert('Biblioteca XLSX não carregada.'); return; }
        const wb = XLSX.utils.book_new();
        const wsData = [[titulo], [`Instituição: ${instituicao}`], [`Data: ${dataGeracao}`], [`Gerado por: ${usuario}`], [`Total: ${data.length}`], [], ...data.map(item => Object.values(item))];
        const ws = XLSX.utils.aoa_to_sheet(wsData);
        ws['!cols'] = Object.keys(data[0]).map(() => ({ wch: 20 }));
        XLSX.utils.book_append_sheet(wb, ws, titulo.substring(0, 30));
        XLSX.writeFile(wb, `${nomeArquivo}.xlsx`);
    },
    exportPDFReport: (data, nomeArquivo, titulo, instituicao, dataGeracao, usuario, logo = null) => {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('landscape', 'mm', 'a4');
        let startY = 15;
        if (logo) { try { doc.addImage(logo, 'JPEG', 14, 10, 20, 20); startY = 35; } catch(e) {} }
        doc.setFontSize(16); doc.text(titulo, 14, startY);
        doc.setFontSize(10);
        doc.text(`Instituição: ${instituicao}`, 14, startY + 7);
        doc.text(`Data: ${dataGeracao}`, 14, startY + 12);
        doc.text(`Gerado por: ${usuario}`, 14, startY + 17);
        doc.text(`Total: ${data.length}`, 14, startY + 22);
        doc.autoTable({ head: [Object.keys(data[0])], body: data.map(item => Object.values(item).map(v => String(v || '-'))), startY: startY + 27, styles: { fontSize: 8, cellPadding: 2 }, headStyles: { fillColor: [30, 58, 138], textColor: 255 }, alternateRowStyles: { fillColor: [240, 245, 255] } });
        doc.save(`${nomeArquivo}.pdf`);
    }
};
