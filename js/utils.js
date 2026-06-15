const utils = {
    generateCode: () => `FDSF-${new Date().getFullYear()}-${Math.floor(10000 + Math.random() * 90000)}`,
    
    compressImage: (file, mw = 400, mh = 400, q = 0.7) => {
        return new Promise((resolve, reject) => {
            const r = new FileReader();
            r.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    const c = document.createElement('canvas'); const ctx = c.getContext('2d');
                    let w = img.width, h = img.height;
                    if (w > mw) { h = (h * mw) / w; w = mw; }
                    if (h > mh) { w = (w * mh) / h; h = mh; }
                    c.width = w; c.height = h; ctx.drawImage(img, 0, 0, w, h);
                    resolve(c.toDataURL('image/jpeg', q));
                };
                img.onerror = reject; img.src = e.target.result;
            };
            r.onerror = reject; r.readAsDataURL(file);
        });
    },

    generateId: () => 'inst_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
    
    hashPassword: async (p) => {
        const s = 'FDSF_INV_2026_SECURE_SALT';
        const d = new TextEncoder().encode(s + p);
        const hb = await crypto.subtle.digest('SHA-256', d);
        return Array.from(new Uint8Array(hb)).map(b => b.toString(16).padStart(2, '0')).join('');
    },
    
    exportCSV: (items) => {
        const h = ['Codigo', 'Patrimonio', 'Instituicao', 'Categoria', 'Descricao', 'Status', 'Responsavel', 'DataEntrada', 'Observacao'];
        const r = items.map(i => [i.codigo, i.patrimonio || '', i.instituicaoNome || '', i.categoria, i.descricao, i.status, i.responsavel || '', i.dataEntrada, i.observacao || '']);
        const c = "data:text/csv;charset=utf-8,\uFEFF" + [h, ...r].map(e => e.map(x => `"${String(x).replace(/"/g, '""')}"`).join(";")).join("\n");
        const l = document.createElement("a"); l.setAttribute("href", encodeURI(c)); l.setAttribute("download", "inventario.csv"); document.body.appendChild(l); l.click(); document.body.removeChild(l);
    },
    
    exportPDF: (items) => {
        const { jsPDF } = window.jspdf; const doc = new jsPDF('landscape', 'mm', 'a4');
        doc.text("Relatório de Inventário", 14, 15);
        doc.autoTable({ head: [['Código', 'Patrimônio', 'Unidade', 'Categoria', 'Descrição', 'Status']], body: items.map(i => [i.codigo, i.patrimonio || '-', i.instituicaoNome || '', i.categoria, i.descricao, i.status]), startY: 20, styles: { fontSize: 8, cellPadding: 2 }, headStyles: { fillColor: [30, 58, 138], textColor: 255 } });
        doc.save("inventario.pdf");
    },
    
    exportCSVReport: (data, n) => {
        if (!data?.length) return;
        const h = Object.keys(data[0]);
        const c = "data:text/csv;charset=utf-8,\uFEFF" + [h, ...data.map(i => h.map(x => i[x] || ''))].map(e => e.map(x => `"${String(x).replace(/"/g, '""')}"`).join(";")).join("\n");
        const l = document.createElement("a"); l.setAttribute("href", encodeURI(c)); l.setAttribute("download", `${n}.csv`); document.body.appendChild(l); l.click(); document.body.removeChild(l);
    },
    
    exportXLSX: (data, n, t, inst, dg, usr, logo = null) => {
        if (typeof XLSX === 'undefined') { alert('Biblioteca XLSX não carregada.'); return; }
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet([[t], [`Instituição: ${inst}`], [`Data: ${dg}`], [`Gerado por: ${usr}`], [`Total: ${data.length}`], [], ...data.map(i => Object.values(i))]);
        ws['!cols'] = Object.keys(data[0]).map(() => ({ wch: 20 }));
        XLSX.utils.book_append_sheet(wb, ws, t.substring(0, 30));
        XLSX.writeFile(wb, `${n}.xlsx`);
    },
    
    exportPDFReport: (data, n, t, inst, dg, usr, logo = null) => {
        const { jsPDF } = window.jspdf; const doc = new jsPDF('landscape', 'mm', 'a4');
        let sy = 15;
        if (logo) { try { doc.addImage(logo, 'JPEG', 14, 10, 20, 20); sy = 35; } catch(e) {} }
        doc.setFontSize(16); doc.text(t, 14, sy); doc.setFontSize(10);
        doc.text(`Instituição: ${inst}`, 14, sy + 7); doc.text(`Data: ${dg}`, 14, sy + 12); doc.text(`Gerado por: ${usr}`, 14, sy + 17); doc.text(`Total: ${data.length}`, 14, sy + 22);
        doc.autoTable({ head: [Object.keys(data[0])], body: data.map(i => Object.values(i).map(v => String(v || '-'))), startY: sy + 27, styles: { fontSize: 8, cellPadding: 2 }, headStyles: { fillColor: [30, 58, 138], textColor: 255 }, alternateRowStyles: { fillColor: [240, 245, 255] } });
        doc.save(`${n}.pdf`);
    }
};