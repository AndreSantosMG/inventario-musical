const utils = {
    generateCode: () => {
        const year = new Date().getFullYear();
        const random = Math.floor(10000 + Math.random() * 90000);
        return `MUS-${year}-${random}`;
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
        const headers = ['Codigo', 'Instituicao', 'Categoria', 'Descricao', 'Status', 'Responsavel', 'DataEntrada', 'Observacao'];
        const rows = items.map(i => [i.codigo, i.instituicaoNome || '', i.categoria, i.descricao, i.status, i.responsavel || '', i.dataEntrada, i.observacao || '']);
        const csvContent = "data:text/csv;charset=utf-8," + [headers, ...rows].map(e => e.join(";")).join("\n");
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
        const doc = new jsPDF();
        doc.text("Relatório de Inventário", 14, 15);
        const tableData = items.map(i => [i.codigo, i.instituicaoNome || '', i.categoria, i.descricao, i.status]);
        doc.autoTable({ head: [['Código', 'Unidade', 'Categoria', 'Descrição', 'Status']], body: tableData, startY: 20 });
        doc.save("inventario.pdf");
    }
};
