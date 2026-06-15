const utils = {
    generateCode: () => {
        const year = new Date().getFullYear();
        const random = Math.floor(10000 + Math.random() * 90000);
        return `FDSF-${year}-${random}`;
    },
    compressImage: (file) => {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');
                    const maxWidth = 400;
                    const scale = maxWidth / img.width;
                    canvas.width = maxWidth;
                    canvas.height = img.height * scale;
                    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                    resolve(canvas.toDataURL('image/jpeg', 0.7));
                };
                img.src = e.target.result;
            };
            reader.readAsDataURL(file);
        });
    },
    generateId: () => {
        return 'inst_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    },
    exportCSV: (items) => {
        const headers = ['Codigo', 'Patrimonio', 'Instituicao', 'Categoria', 'Descricao', 'Status', 'Responsavel', 'DataEntrada', 'Observacao'];
        const rows = items.map(i => [i.codigo, i.patrimonio || '', i.instituicaoNome || '', i.categoria, i.descricao, i.status, i.responsavel || '', i.dataEntrada, i.observacao || '']);
        const csvContent = "data:text/csv;charset=utf-8,\uFEFF" + [headers, ...rows].map(e => e.map(c => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\n");
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", "inventario.csv");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    },
    exportPDF: (items) => {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('landscape', 'mm', 'a4');
        doc.text("Relatório de Inventário", 14, 15);
        const tableData = items.map(i => [i.codigo, i.patrimonio || '-', i.instituicaoNome || '', i.categoria, i.descricao, i.status]);
        doc.autoTable({ 
            head: [['Código', 'Patrimônio', 'Unidade', 'Categoria', 'Descrição', 'Status']], 
            body: tableData, 
            startY: 20,
            styles: { fontSize: 8, cellPadding: 2 },
            headStyles: { fillColor: [30, 58, 138], textColor: 255 }
        });
        doc.save("inventario.pdf");
    },
    exportCSVReport: (data, nomeArquivo) => {
        if (!data || data.length === 0) return;
        const headers = Object.keys(data[0]);
        const rows = data.map(item => headers.map(h => item[h] || ''));
        const csvContent = "data:text/csv;charset=utf-8,\uFEFF" + [headers, ...rows].map(e => e.map(c => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\n");
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `${nomeArquivo}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    },
    exportXLSX: (data, nomeArquivo, titulo, instituicao, dataGeracao, usuario) => {
        if (typeof XLSX === 'undefined') {
            alert('Biblioteca XLSX não carregada. Verifique sua conexão com a internet.');
            return;
        }
        const wb = XLSX.utils.book_new();
        
        const headerData = [
            [titulo],
            [`Instituição: ${instituicao}`],
            [`Data de geração: ${dataGeracao}`],
            [`Gerado por: ${usuario}`],
            [`Total de registros: ${data.length}`],
            []
        ];
        
        const wsData = [...headerData, ...data.map(item => Object.values(item))];
        const ws = XLSX.utils.aoa_to_sheet(wsData);
        
        const headers = Object.keys(data[0]);
        ws['!cols'] = headers.map(() => ({ wch: 20 }));
        
        XLSX.utils.book_append_sheet(wb, ws, titulo.substring(0, 30));
        XLSX.writeFile(wb, `${nomeArquivo}.xlsx`);
    },
    exportPDFReport: (data, nomeArquivo, titulo, instituicao, dataGeracao, usuario) => {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('landscape', 'mm', 'a4');
        
        doc.setFontSize(16);
        doc.text(titulo, 14, 15);
        doc.setFontSize(10);
        doc.text(`Instituição: ${instituicao}`, 14, 22);
        doc.text(`Data: ${dataGeracao}`, 14, 27);
        doc.text(`Gerado por: ${usuario}`, 14, 32);
        doc.text(`Total de registros: ${data.length}`, 14, 37);
        
        const headers = [Object.keys(data[0])];
        const body = data.map(item => Object.values(item).map(v => String(v || '-')));
        
        doc.autoTable({
            head: headers,
            body: body,
            startY: 42,
            styles: { fontSize: 8, cellPadding: 2 },
            headStyles: { fillColor: [30, 58, 138], textColor: 255 },
            alternateRowStyles: { fillColor: [240, 245, 255] }
        });
        
        doc.save(`${nomeArquivo}.pdf`);
    }
};
