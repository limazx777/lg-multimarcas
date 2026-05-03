// Configuração do Firebase
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-app.js";
import { getFirestore, collection, doc, updateDoc, increment, onSnapshot } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDE0MvjrK5PfNazbICAeWtr43hj8tgfGbY",
  authDomain: "lg-grifes.firebaseapp.com",
  projectId: "lg-grifes",
  storageBucket: "lg-grifes.firebasestorage.app",
  messagingSenderId: "527321437715",
  appId: "1:527321437715:web:919725bbdd1f0425a791e6",
  measurementId: "G-LB5L8YLMXB"
};


// Inicializa Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

let products = [];
let groupedProducts = []; // Nova variável para manter IDs estáveis

// Variáveis para controlar o que o usuário escolheu
let corSelecionada = "";
let tamanhoSelecionado = null;

// Carrega o carrinho do localStorage ou inicia vazio
let cart = JSON.parse(localStorage.getItem('lg_grifes_cart')) || [];

// Helper para formatar moeda brasileira
const formatPrice = (value) => {
    // Converte para número e lida com possíveis vírgulas vindas do painel
    const num = typeof value === 'string' ? parseFloat(value.replace(',', '.')) : value;
    return (num || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};

document.addEventListener('DOMContentLoaded', () => {
    loadData();
    initReveal();
    updateCartCount();
    lucide.createIcons();
    window.setupNavigation();
});

function loadData() {
    // Mostra esqueletos cinzas antes de carregar os dados reais
    renderSkeletons('.products-grid', 6);
    renderSkeletons('#featured-products', 3);

    // onSnapshot monitora o banco. Se o Admin mudar algo, ele avisa o site.
    onSnapshot(collection(db, "products"), (snapshot) => {
        products = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        groupedProducts = groupProducts(products); // Agrupa uma única vez por snapshot
        checkCartStockDepletion(products);
        renderProducts(); 
        renderFeatured();
        console.log("Estoque atualizado em tempo real!");
    }, (error) => {
        console.error("Erro ao carregar produtos:", error);
    });
}

// Renderiza esqueletos para o estado de loading
function renderSkeletons(containerSelector, count) {
    const container = document.querySelector(containerSelector);
    if (!container) return;
    
    let skeletonsHTML = '';
    for (let i = 0; i < count; i++) {
        skeletonsHTML += `
            <div class="product-card">
                <div class="product-image-container skeleton"></div>
                <div class="product-info">
                    <div class="skeleton" style="height: 20px; width: 80%; margin-bottom: 10px;"></div>
                    <div class="skeleton" style="height: 15px; width: 40%; margin-bottom: 20px;"></div>
                    <div class="skeleton" style="height: 35px; width: 100%;"></div>
                </div>
            </div>
        `;
    }
    container.innerHTML = skeletonsHTML;
}

// Verifica se algum item no carrinho acabou no banco de dados
function checkCartStockDepletion(freshProducts) {
    if (cart.length === 0) return;

    cart.forEach(item => {
        const dbProduct = freshProducts.find(p => p.id === item.id);
        if (dbProduct) {
            let stockAvailable = 0;
            const color = item.color || 'Unica';
            
            if (dbProduct.stocks && dbProduct.stocks[color] && dbProduct.stocks[color][item.size] !== undefined) {
                stockAvailable = dbProduct.stocks[color][item.size];
            } else {
                stockAvailable = dbProduct.stock !== undefined ? dbProduct.stock : 0;
            }

            if (stockAvailable <= 0) {
                showStockAlert(`O item "${item.name} (${item.size})" esgotou e foi removido do carrinho.`);
                // Remove o item esgotado do carrinho automaticamente
                cart = cart.filter(cartItem => !(cartItem.id === item.id && cartItem.color === item.color && cartItem.size === item.size));
                saveCart();
                updateCartCount();
                renderCart();
            }
        }
    });
}

let stockAlertTimeout;
function showStockAlert(message) {
    const alertDiv = document.getElementById('stock-alert');
    if (alertDiv) {
        alertDiv.innerText = message;
        alertDiv.style.display = 'block';

        clearTimeout(stockAlertTimeout);
        stockAlertTimeout = setTimeout(() => { alertDiv.style.display = 'none'; }, 5000);
    }
}

// Helper para agrupar produtos pelo nome (SKU para Produto)
function groupProducts(prods) {
    const grouped = {};
    prods.forEach(p => {
        if (!grouped[p.name]) {
            // Se o produto já trouxer o mapa 'stocks' do banco, nós o preservamos.
            grouped[p.name] = { ...p, stocks: p.stocks || {} };
        }

        // Se o documento for uma variação individual (color/size), alimentamos o mapa.
        // Isso garante retrocompatibilidade e flexibilidade.
        const cor = p.color || 'Unica';
        const tam = p.size;
        
        if (tam) {
            if (!grouped[p.name].stocks[cor]) {
                grouped[p.name].stocks[cor] = {};
            }
            // Garante que o estoque seja tratado como número para a comparação
            const stockValue = typeof p.stock === 'string' ? parseInt(p.stock) : (p.stock || 0);
            grouped[p.name].stocks[cor][tam] = (grouped[p.name].stocks[cor][tam] || 0) + stockValue;
        }
    });
    return Object.values(grouped);
}

// Helper para gerar as opções de cores baseadas no banco
function renderColorOptions(p, isFeatured, selectedColor) {
    const prefix = isFeatured ? 'feat-' : '';
    // Extraímos as cores diretamente das chaves do objeto stocks
    const colors = Object.keys(p.stocks || {}).filter(c => c !== 'Unica');
    
    if (colors.length === 0) return '';

    return colors.map(c => {
        const activeClass = c === selectedColor ? 'selected' : '';
        return `
            <button class="color-btn ${activeClass}" onclick="window.selecionarCor(this, '${c}', '${p.id}', '${prefix}')">
                ${c}
            </button>
        `;
    }).join('');
}

// Helper para gerar as opções de tamanho baseadas no estoque do banco
function renderSizeOptions(p, selectedColor) {
    const listaTamanhos = ['PP', 'P', 'M', 'G', 'GG'];
    let htmlBotoes = '';

    listaTamanhos.forEach(t => {
        // BUSCA EXATA: Procura no objeto 'stocks' a cor e depois o tamanho
        const qtdEstoque = (p.stocks && p.stocks[selectedColor]) ? p.stocks[selectedColor][t] : 0;
        const disponivel = qtdEstoque > 0;
        
        const classeStatus = disponivel ? 'size-btn' : 'size-btn out-of-stock';
        const atributoDisabled = disponivel ? '' : 'disabled';

        htmlBotoes += `
            <button class="${classeStatus}" ${atributoDisabled} onclick="window.selecionarTamanho(this, '${t}')" data-size="${t}">
                ${t}
            </button>
        `;
    });
    return htmlBotoes;
}

// Função para permitir a seleção no clique
window.selecionarTamanho = (elemento, tamanho) => {
    // Remove a seleção apenas dos botões DESTE produto (card)
    const card = elemento.closest('.product-card');
    card.querySelectorAll('.size-btn').forEach(btn => btn.classList.remove('selected'));
    // Adiciona ao que foi clicado
    elemento.classList.add('selected');
    console.log("Selecionado:", tamanho);
};

// Função para selecionar a cor
window.selecionarCor = (elemento, cor, productId, prefix) => {
    const card = elemento.closest('.product-card');
    card.querySelectorAll('.color-btn').forEach(btn => btn.classList.remove('selected'));
    elemento.classList.add('selected');
    
    // Passamos a cor diretamente para evitar erros de leitura do DOM
    window.updateSizeSelector(productId, cor, card);
};

window.updateSizeSelector = function(productId, color, card) {
    if (!card) {
        card = document.getElementById(`tamanhos-${productId}`)?.closest('.product-card');
    }
    if (!card) return;

    // Usa a lista global estável para encontrar o produto
    const p = groupedProducts.find(item => item.id === productId);
    if (!p) {
        console.error("Produto não encontrado para ID:", productId);
        return;
    }

    // Buscamos o inventário específico da cor selecionada dentro da fonte da verdade
    const estoqueCor = p.stocks && p.stocks[color] ? p.stocks[color] : {};
    const sizeBtns = card.querySelectorAll('.size-btn');
    
    sizeBtns.forEach(btn => {
        const size = btn.dataset.size;
        const qtd = estoqueCor[size] || 0;
        const hasStock = qtd > 0;
        
        btn.disabled = !hasStock;
        btn.classList.toggle('out-of-stock', !hasStock);
        
        if (!hasStock && btn.classList.contains('selected')) {
            btn.classList.remove('selected');
        }
    });
};

window.setupNavigation = () => {
    // Fecha o menu mobile automaticamente ao clicar em um link de navegação
    document.querySelectorAll('.nav-menu a').forEach(link => {
        link.addEventListener('click', () => {
            if (document.getElementById('nav-menu').classList.contains('active')) {
                toggleMenu();
            }
        });
    });
};

window.initScrollGuide = () => {
    // Monitora o scroll das peças em destaque para inverter a seta
    const featuredScroll = document.getElementById('featured-products');
    const scrollGuide = document.querySelector('.scroll-guide');
    if (featuredScroll && scrollGuide) {
        featuredScroll.addEventListener('scroll', () => {
            const isEnd = featuredScroll.scrollLeft + featuredScroll.clientWidth >= featuredScroll.scrollWidth - 10;
            scrollGuide.classList.toggle('at-end', isEnd);
        });
    }
};

function renderProducts(filter = 'all') {
    const grid = document.querySelector('.products-grid');
    if (!grid) return;
    grid.innerHTML = '';
    
    // Filtra a partir da lista já agrupada para manter consistência
    const grouped = filter === 'all' ? groupedProducts : groupedProducts.filter(p => p.category === filter);

    grouped.forEach(p => {
        const slug = p.name.replace(/\s+/g, '-').toLowerCase();
        // Define a cor inicial: a primeira encontrada ou 'Unica' como fallback
        const colors = Object.keys(p.stocks || {}).filter(c => c !== 'Unica');
        const defaultColor = colors.length > 0 ? colors[0] : 'Unica';

        grid.innerHTML += `
            <div class="product-card reveal">
                <div class="product-image-container" onclick="openImageViewer('${p.image}')" style="cursor: zoom-in;">
                    <img src="${p.image}" alt="${p.name}" class="product-image" loading="lazy" decoding="async">
                </div>
                <div class="product-info">
                    <h3 class="product-name">${p.name}</h3>
                    <p class="product-price">${formatPrice(p.price)}</p>
                    <div class="product-options">
                        <div class="color-selector">
                            ${renderColorOptions(p, false, defaultColor)}
                        </div>
                        <div class="size-selectors" id="tamanhos-${p.id}">
                            ${renderSizeOptions(p, defaultColor)}
                        </div>
                        <div class="quantity-selector">
                            <button class="qty-btn" onclick="window.changeQty('${slug}', -1, false)">-</button>
                            <input type="number" id="qty-${slug}" class="qty-input" value="1" min="1" readonly>
                            <button class="qty-btn" onclick="window.changeQty('${slug}', 1, false)">+</button>
                        </div>
                    </div>
                    <button class="btn-gold" onclick="window.addToCart('${p.id}', false)">ADICIONAR</button>
                </div>
            </div>
        `;
    });
    initReveal();
}

// Função para filtrar produtos (global para os botões HTML)
window.filterProducts = function(category) {
    const buttons = document.querySelectorAll('.filter-btn');
    buttons.forEach(btn => {
        btn.classList.toggle('active', 
            (category === 'all') || 
            (btn.innerText.toLowerCase() === category)
        );
    });
    renderProducts(category);
};

// Lógica do Menu Mobile
window.toggleMenu = function() {
    document.getElementById('mobile-menu').classList.toggle('active');
    document.getElementById('nav-menu').classList.toggle('active');
};

// Lógica para abrir/fechar o carrinho
window.toggleCart = function() {
    const sidebar = document.getElementById('cart-sidebar');
    if (!sidebar) return;
    sidebar.classList.toggle('active');
    if (sidebar.classList.contains('active')) {
        renderCart();
    }
};

// Renderiza os itens dentro do carrinho lateral
function renderCart() {
    const cartItemsContainer = document.getElementById('cart-items');
    const cartTotalValue = document.getElementById('cart-total-value');
    const cartFooter = document.querySelector('.cart-footer');
    
    if (!cartItemsContainer || !cartTotalValue) return;

    cartItemsContainer.innerHTML = '';

    if (cart.length === 0) {
        cartItemsContainer.innerHTML = `
            <div class="empty-cart-message" style="text-align: center; padding: 4rem 1rem;">
                <p style="font-family: var(--font-heading); font-size: 1.2rem; font-style: italic; color: #888; margin-bottom: 2rem;">Seu carrinho está vazio</p>
                <a href="colecao.html" class="btn-gold" style="font-size: 0.7rem; padding: 1rem 2rem;" onclick="toggleCart()">Explorar Coleção</a>
            </div>
        `;
        cartTotalValue.innerText = formatPrice(0);
        if (cartFooter) cartFooter.style.display = 'none';
        return;
    }

    if (cartFooter) cartFooter.style.display = 'block';
    let total = 0;

    cart.forEach((item, index) => {
        total += item.price * item.quantity;
        cartItemsContainer.innerHTML += `
            <div class="cart-item" style="display: flex; align-items: center; gap: 1rem; margin-bottom: 1.5rem; border-bottom: 1px solid var(--gray); padding-bottom: 1rem;">
                <img src="${item.image}" alt="${item.name}" style="width: 65px; height: 65px; object-fit: cover; border-radius: 2px; border: 1px solid var(--gray);">
                <div style="flex: 1; display: flex; flex-direction: column; gap: 4px;">
                    <p style="font-weight: 700; font-size: 0.85rem; letter-spacing: 1px;">${item.name}</p>
                    <p style="color: #888; font-size: 0.75rem; text-transform: uppercase;">${item.color ? item.color + ' - ' : ''}${item.size || 'N/A'}</p>
                    <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 5px;">
                        <div class="quantity-selector" style="height: 28px; border-color: #333;">
                            <button class="qty-btn" onclick="window.updateCartQty(${index}, -1)" style="width: 28px;">-</button>
                            <span style="padding: 0 12px; font-size: 0.8rem; font-weight: 600;">${item.quantity}</span>
                            <button class="qty-btn" onclick="window.updateCartQty(${index}, 1)" style="width: 28px;">+</button>
                        </div>
                        <p style="color: var(--gold); font-size: 0.9rem; font-weight: 400;">${formatPrice(item.price)}</p>
                    </div>
                </div>
                <button onclick="window.removeFromCart(${index})" style="background: none; border: none; color: #ff4d4d; cursor: pointer; font-size: 1.5rem; padding: 0 5px; align-self: flex-start; line-height: 1;">&times;</button>
            </div>
        `;
    });

    cartTotalValue.innerText = formatPrice(total);
}

function renderFeatured() {
    const featuredContainer = document.getElementById('featured-products');
    if (!featuredContainer) return;
    featuredContainer.innerHTML = '';
    
    // Usa a lista global estável
    // Pega as 3 primeiras peças de qualquer categoria da coleção
    const featuredList = groupedProducts.slice(0, 3);

    featuredList.forEach(p => {
        const slug = p.name.replace(/\s+/g, '-').toLowerCase();
        // Define a cor inicial para os destaques
        const colors = Object.keys(p.stocks || {}).filter(c => c !== 'Unica');
        const defaultColor = colors.length > 0 ? colors[0] : 'Unica';

        featuredContainer.innerHTML += `
            <div class="product-card" style="min-width: 300px;">
                <div class="product-image-container" style="height: 350px; cursor: zoom-in;" onclick="openImageViewer('${p.image}')">
                    <img src="${p.image}" alt="${p.name}" class="product-image" loading="lazy" decoding="async">
                </div>
                <div class="product-info">
                    <h3 class="product-name">${p.name}</h3>
                    <p class="product-price">${formatPrice(p.price)}</p>
                    <div class="product-options">
                        <div class="color-selector">
                            ${renderColorOptions(p, true, defaultColor)}
                        </div>
                        <div class="size-selectors" id="tamanhos-${p.id}">
                            ${renderSizeOptions(p, defaultColor)}
                        </div>
                        <div class="quantity-selector">
                            <button class="qty-btn" onclick="window.changeQty('${slug}', -1, true)">-</button>
                            <input type="number" id="qty-feat-${slug}" class="qty-input" value="1" min="1" readonly>
                            <button class="qty-btn" onclick="window.changeQty('${slug}', 1, true)">+</button>
                        </div>
                    </div>
                    <button class="btn-gold" style="padding: 0.8rem 1.5rem;" onclick="window.addToCart('${p.id}', true)">ADICIONAR</button>
                </div>
            </div>
        `;
    });
    window.initScrollGuide();
}

window.changeQty = function(slug, delta, isFeatured) {
    const prefix = isFeatured ? 'feat-' : '';
    const input = document.getElementById(`qty-${prefix}${slug}`);
    if (input) {
        let value = parseInt(input.value) || 1;
        value += delta;
        if (value < 1) value = 1;
        input.value = value;
    }
};

// Funções do Visualizador de Imagem
window.openImageViewer = function(src) {
    const viewer = document.getElementById('image-viewer');
    const viewerImg = document.getElementById('viewer-img');
    if (viewer && viewerImg) {
        viewerImg.src = src;
        viewer.classList.add('active');
        document.body.style.overflow = 'hidden'; // Impede o scroll do site ao fundo
    }
};

window.closeImageViewer = function() {
    const viewer = document.getElementById('image-viewer');
    if (viewer) {
        viewer.classList.remove('active');
        document.body.style.overflow = ''; // Restaura o scroll
    }
};

window.addToCart = function(productId, isFeatured = false) {
    const grouped = groupProducts(products);
    const pGrouped = grouped.find(p => p.id === productId);
    if (!pGrouped) return;

    const productName = pGrouped.name;
    const prefix = isFeatured ? 'feat-' : '';
    const slug = productName.replace(/\s+/g, '-').toLowerCase();
    const ev = window.event || event;
    const eventTarget = ev.target;
    const card = eventTarget.closest('.product-card');
    const sizeBtn = card.querySelector('.size-btn.selected');
    const colorBtn = card.querySelector('.color-btn.selected');
    const hasColorOptions = !!card.querySelector('.color-btn');

    // Validação de cor
    if (hasColorOptions && !colorBtn) {
        const btn = eventTarget;
        const selector = card.querySelector('.color-selector');
        
        selector.classList.add('shake-error');
        setTimeout(() => selector.classList.remove('shake-error'), 400);
        
        const originalText = btn.innerText;
        btn.innerText = "ESCOLHA A COR";
        btn.style.color = "#ff4d4d";
        setTimeout(() => { btn.innerText = originalText; btn.style.color = ""; }, 1500);
        return;
    }

    // Validação de tamanho
    if (!sizeBtn) {
        const btn = eventTarget;
        const selector = card.querySelector('.size-selectors');
        
        selector.classList.add('shake-error');
        setTimeout(() => selector.classList.remove('shake-error'), 400);
        
        const originalText = btn.innerText;
        btn.innerText = "ESCOLHA O TAMANHO";
        btn.style.color = "#ff4d4d";
        setTimeout(() => { btn.innerText = originalText; btn.style.color = ""; }, 1500);
        return;
    }

    const size = sizeBtn.dataset.size;
    const color = colorBtn ? colorBtn.innerText.trim() : 'Unica';
    const qtyInput = document.getElementById(`qty-${prefix}${slug}`);
    const quantity = parseInt(qtyInput ? qtyInput.value : 1) || 1;

    // Busca o produto. Primeiro tentamos encontrar o SKU exato (caso Flat) 
    // ou o documento base que contém o mapa de estoques (caso Nested)
    let product = products.find(p => p.name === productName && p.size === size && (!hasColorOptions || p.color === color));
    
    if (!product) {
        product = products.find(p => p.name === productName);
    }

    if (!product) {
        console.error("Produto não encontrado no banco de dados.");
        return;
    }

    // Validação de estoque: Verifica no mapa 'stocks' ou no campo 'stock' direto
    let stockAvailable = 0;
    if (product.stocks && product.stocks[color] && product.stocks[color][size] !== undefined) {
        stockAvailable = product.stocks[color][size];
    } else {
        stockAvailable = product.stock !== undefined ? product.stock : 0;
    }

    if (quantity > stockAvailable) {
        showStockAlert(`Estoque insuficiente! Apenas ${stockAvailable} unidade(s) de tamanho ${size} disponível(is).`);
        return;
    }

    // No carrinho, a chave única é ID + Cor + Tamanho
    const existingItem = cart.find(item => item.id === product.id && item.size === size && item.color === color);

    if (existingItem) {
        existingItem.quantity += quantity;
    } else {
        cart.push({ ...product, size, color, quantity });
    }

    saveCart();
    updateCartCount();

    // Fecha o modal anterior caso um novo item seja adicionado rapidamente
    closeSuccessModal();
    showSuccessModal(product, size, quantity);

    // Atualiza a lista visual se o carrinho estiver aberto
    if (document.getElementById('cart-sidebar').classList.contains('active')) {
        renderCart();
    }
};

let successTimeout;
function showSuccessModal(product, size, quantity) {
    const modal = document.getElementById('success-modal');
    const info = document.getElementById('success-product-info');
    if (modal && info) {
        info.innerText = `${quantity}x ${product.name} (${size}) adicionado com sucesso`;
        
        // Reinicia a animação removendo a classe e forçando um reflow do DOM
        modal.classList.remove('active');
        void modal.offsetWidth; 
        modal.classList.add('active');
        
        clearTimeout(successTimeout);
        successTimeout = setTimeout(() => {
            closeSuccessModal();
        }, 3000);
    }
}

function closeSuccessModal() {
    const modal = document.getElementById('success-modal');
    if (modal) modal.classList.remove('active');
}

window.updateCartQty = function(index, delta) {
    const item = cart[index];
    if (!item) return;

    const newQty = item.quantity + delta;
    if (newQty < 1) {
        window.removeFromCart(index);
        return;
    }

    // Valida o estoque em tempo real antes de permitir o aumento
    if (delta > 0) {
        const dbProduct = products.find(p => p.id === item.id);
        if (dbProduct) {
            const color = item.color || 'Unica';
            const stockAvailable = (dbProduct.stocks && dbProduct.stocks[color] && dbProduct.stocks[color][item.size] !== undefined) 
                ? dbProduct.stocks[color][item.size] 
                : (dbProduct.stock !== undefined ? dbProduct.stock : 0);

            if (newQty > stockAvailable) {
                showStockAlert(`Estoque insuficiente! Apenas ${stockAvailable} unidade(s) disponível(is).`);
                return;
            }
        }
    }

    item.quantity = newQty;
    saveCart();
    updateCartCount();
    renderCart();
};

window.removeFromCart = function(index) {
    cart.splice(index, 1);
    saveCart();
    updateCartCount();
    renderCart();
};

// Controle do Modal de Checkout
window.checkout = function() {
    if (cart.length === 0) {
        showStockAlert("Seu carrinho está vazio.");
        return;
    }
    
    const total = cart.reduce((acc, item) => acc + (item.price * item.quantity), 0);
    document.getElementById('checkout-total-display').innerText = formatPrice(total);
    document.getElementById('checkout-modal').style.display = 'block';
    window.toggleCart(); // Fecha o sidebar do carrinho
};

window.closeCheckoutModal = function() {
    document.getElementById('checkout-modal').style.display = 'none';
};

window.toggleAddressFields = function(show) {
    const addressSection = document.getElementById('address-section');
    const inputs = addressSection.querySelectorAll('input');
    addressSection.style.display = show ? 'block' : 'none';
    inputs.forEach(input => {
        if (show) input.setAttribute('required', 'required');
        else input.removeAttribute('required');
    });
};

window.handlePaymentChange = function(value) {
    const changeSection = document.getElementById('change-section');
    if (value === 'dinheiro') {
        changeSection.style.display = 'block';
    } else {
        changeSection.style.display = 'none';
        document.getElementById('checkout-change').value = '';
    }
};

window.processOrder = async function(e) {
    e.preventDefault();
    
    const name = document.getElementById('checkout-name').value;
    const payment = document.getElementById('checkout-payment').value;
    const deliveryType = document.querySelector('input[name="delivery-type"]:checked').value;
    const street = document.getElementById('checkout-street').value;
    const number = document.getElementById('checkout-number').value;
    const neighborhood = document.getElementById('checkout-neighborhood').value;
    const changeAmount = document.getElementById('checkout-change').value;
    const total = cart.reduce((acc, item) => acc + (item.price * item.quantity), 0);

    // 1. Atualiza o estoque no Firebase
    try {
        for (const item of cart) {
            // Localiza o produto atualizado na nossa lista local (onSnapshot) para saber a estrutura atual
            const dbProduct = products.find(p => p.id === item.id);
            
            if (!dbProduct) {
                console.warn(`Produto ${item.id} não encontrado para atualizar estoque.`);
                continue;
            }

            const productRef = doc(db, "products", item.id);
            const updatePayload = {};

            // Verifica se o produto no banco usa a estrutura de mapa 'stocks'
            // Usamos o dbProduct (dados frescos do onSnapshot) em vez do item do carrinho
            if (dbProduct.stocks && dbProduct.stocks[item.color]) {
                // Usa a notação de ponto para atualizar apenas uma chave específica do mapa
                updatePayload[`stocks.${item.color}.${item.size}`] = increment(-item.quantity);
            } else {
                // Caso contrário, atualizamos o campo 'stock' genérico
                updatePayload.stock = increment(-item.quantity);
            }

            await updateDoc(productRef, updatePayload);
            console.log(`Estoque atualizado: ${item.name} (${item.color} - ${item.size}) -${item.quantity}`);
        }
    } catch (error) {
        console.error("Erro ao atualizar estoque:", error);
        showStockAlert("Ocorreu um erro ao processar seu pedido. Tente novamente.");
        return;
    }

    // Formata os itens do carrinho para compor a mensagem
    let itemsText = "";
    cart.forEach(item => {
        itemsText += `- ${item.quantity}x ${item.name} (${item.color ? item.color + ' - ' : ''}${item.size}): ${formatPrice(item.price * item.quantity)}\n`;
    });

    // Constrói a mensagem estruturada para o WhatsApp
    let message = `*NOVO PEDIDO - LG GRIFES*\n\n`;
    message += `*Cliente:* ${name}\n`;
    message += `*Tipo:* ${deliveryType === 'entrega' ? 'Entrega' : 'Retirada na Loja'}\n`;
    if (deliveryType === 'entrega') message += `*Endereço:* ${street}, ${number} - ${neighborhood}\n`;
    message += `*Pagamento:* ${payment.toUpperCase()}\n\n`;
    if (payment === 'dinheiro' && changeAmount) message += `*Troco para:* R$ ${changeAmount}\n\n`;
    
    message += `*Itens:*\n${itemsText}\n`;
    message += `*TOTAL:* ${formatPrice(total)}`;

    const encodedMessage = encodeURIComponent(message);
    const phoneNumber = "5511999999999"; // Substitua pelo número real da loja (DDD + Número)
    const whatsappUrl = `https://wa.me/${phoneNumber}?text=${encodedMessage}`;

    // Abre o WhatsApp em uma nova aba com a mensagem preenchida
    window.open(whatsappUrl, '_blank');
    
    cart = [];
    saveCart();
    updateCartCount();
    closeCheckoutModal();
};

// Fecha modais ao clicar fora
window.onclick = function(event) {
    const checkoutModal = document.getElementById('checkout-modal');
    const productModal = document.getElementById('product-modal');
    if (event.target == checkoutModal) closeCheckoutModal();
    if (event.target == productModal) closeModal();
};

function updateCartCount() {
    const countDisplay = document.querySelector('.cart-count');
    const cartIcon = document.querySelector('.cart-icon');
    const totalItems = cart.reduce((acc, item) => acc + item.quantity, 0);
    
    if (countDisplay) {
        countDisplay.innerText = totalItems;
        // Aciona a animação de bounce no ícone da sacola
        cartIcon.classList.remove('cart-bounce');
        void cartIcon.offsetWidth; // Força reflow para reiniciar animação
        cartIcon.classList.add('cart-bounce');
    }
}

function saveCart() {
    localStorage.setItem('lg_grifes_cart', JSON.stringify(cart));
}

function initReveal() {
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) entry.target.classList.add('active');
        });
    }, { threshold: 0.1 });
    document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
}

window.addEventListener('scroll', () => {
    document.querySelector('.header').classList.toggle('scrolled', window.scrollY > 50);
});