import { Firestore, collection, getDocs, doc, setDoc } from 'firebase/firestore';
import { RestaurantConfig, Category, MenuItem, Table, StaffMember } from '../types';
import { handleFirestoreError, OperationType } from './firebase';

export const DEFAULT_RESTAURANT_CONFIG: RestaurantConfig = {
  name: 'Bistrô & Parrilla Bella Vista',
  tagline: 'Gastronomia artesanal com carnes nobres, massas frescas e drinks autorais',
  logoUrl: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=200&auto=format&fit=crop&q=80',
  address: 'Rua das Flores, 450 - Centro Gastronômico, São Paulo - SP',
  phone: '(11) 98765-4321',
  pixKey: 'financeiro@bellavista.com.br',
  publicAppUrl: 'https://ais-pre-lq52p6akhj53uxkz6zg2h6-724966331366.us-east1.run.app',
  serviceTaxPercent: 10,
  estimatedKdsAlertMinutes: 15,
  businessHours: 'Terça a Domingo: 11:30 às 15:30 e 18:30 às 23:45',
};

export const DEFAULT_CATEGORIES: Category[] = [
  { id: 'cat_entradas', name: 'Entradas & Petiscos', order: 1, icon: 'UtensilsCrossed', active: true },
  { id: 'cat_carnes', name: 'Grelhados & Parrilla', order: 2, icon: 'Flame', active: true },
  { id: 'cat_burgers', name: 'Burgers Artesanais', order: 3, icon: 'Sandwich', active: true },
  { id: 'cat_massas', name: 'Massas & Risotos', order: 4, icon: 'Soup', active: true },
  { id: 'cat_bebidas', name: 'Bebidas & Drinks', order: 5, icon: 'Wine', active: true },
  { id: 'cat_sobremesas', name: 'Sobremesas da Casa', order: 6, icon: 'CakeSlice', active: true },
];

export const DEFAULT_MENU_ITEMS: MenuItem[] = [
  // Entradas
  {
    id: 'item_carpaccio',
    categoryId: 'cat_entradas',
    name: 'Carpaccio Clássico com Alcaparras',
    description: 'Lâminas ultrafinas de filé mignon, molho de alcaparras, mostarda dijon, lascas de parmesão reggiano e torradas na manteiga de ervas.',
    price: 46.90,
    imageUrl: 'https://images.unsplash.com/photo-1544025162-d76694265947?w=600&auto=format&fit=crop&q=80',
    available: true,
    prepTimeMinutes: 10,
    featured: true,
    options: [
      { name: 'Parmesão Extra', price: 6.00 },
      { name: 'Cesta de Focaccia Adicional', price: 9.00 }
    ]
  },
  {
    id: 'item_brie_folhado',
    categoryId: 'cat_entradas',
    name: 'Queijo Brie Folhado com Mel & Nozes',
    description: 'Queijo brie envolto em massa folhada crocante dourada no forno, servido com redução de frutas vermelhas e mel trufado.',
    price: 52.00,
    imageUrl: 'https://images.unsplash.com/photo-1626777552726-4a6b54c97e46?w=600&auto=format&fit=crop&q=80',
    available: true,
    prepTimeMinutes: 12,
    options: [
      { name: 'Porção Extra de Nozes Glaceadas', price: 7.00 }
    ]
  },
  {
    id: 'item_batata_rustica',
    categoryId: 'cat_entradas',
    name: 'Batatas Rústicas com Alecrim e Aioli',
    description: 'Batatas selecionadas assadas e fritas com casca, sal marinho, alecrim fresco e acompanhadas de maionese artesanal de alho tostado.',
    price: 34.00,
    imageUrl: 'https://images.unsplash.com/photo-1573080496219-bb080dd4f877?w=600&auto=format&fit=crop&q=80',
    available: true,
    prepTimeMinutes: 10,
    options: [
      { name: 'Bacon Crocante em Cubos', price: 6.50 },
      { name: 'Cheddar Inglês Cremoso', price: 7.50 }
    ]
  },
  // Carnes & Parrilla
  {
    id: 'item_ancho_prime',
    categoryId: 'cat_carnes',
    name: 'Bife de Ancho Black Angus (350g)',
    description: 'Corte nobre com marmoreio intenso grelhado na brasa ao seu ponto preferido. Acompanha farofa de cebola caramelizada e chimichurri fresco.',
    price: 94.90,
    imageUrl: 'https://images.unsplash.com/photo-1558030006-450675393462?w=600&auto=format&fit=crop&q=80',
    available: true,
    prepTimeMinutes: 18,
    featured: true,
    options: [
      { name: 'Ponto: Mal Passado', price: 0 },
      { name: 'Ponto: Ao Ponto para Mal', price: 0 },
      { name: 'Ponto: Ao Ponto', price: 0 },
      { name: 'Ponto: Bem Passado', price: 0 },
      { name: 'Legumes na Brasa Adicionais', price: 14.00 }
    ]
  },
  {
    id: 'item_picanha_fatiada',
    categoryId: 'cat_carnes',
    name: 'Picanha Nobre Fatiada (Serve 2 Pessoas)',
    description: '500g de picanha suculenta fatiada, servida com mandioca cremosa na manteiga de garrafa, arroz birô-birô e vinagrete da casa.',
    price: 148.00,
    imageUrl: 'https://images.unsplash.com/photo-1544025162-d76694265947?w=600&auto=format&fit=crop&q=80',
    available: true,
    prepTimeMinutes: 22,
    featured: true,
    options: [
      { name: 'Farofa Especial Extra', price: 9.00 },
      { name: 'Queijo Coalho Grelhado', price: 12.00 }
    ]
  },
  // Burgers
  {
    id: 'item_burger_trufado',
    categoryId: 'cat_burgers',
    name: 'Bella Vista Trufado Burger',
    description: 'Blend bovino 180g na brasa, queijo gruyère derretido, cebola roxa caramelizada, maionese trufada e pão brioche amanteigado tostado.',
    price: 48.00,
    imageUrl: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=600&auto=format&fit=crop&q=80',
    available: true,
    prepTimeMinutes: 14,
    featured: true,
    options: [
      { name: 'Bacon em Tiras Dobrado', price: 6.00 },
      { name: 'Hambúrguer Extra (180g)', price: 14.00 }
    ]
  },
  {
    id: 'item_smash_duplo',
    categoryId: 'cat_burgers',
    name: 'Double Smash Bacon Crocante',
    description: 'Dois discos smash de 90g com crostinha crocante, queijo cheddar americano duplo derretido, farofa de bacon e molho especial no brioche.',
    price: 42.00,
    imageUrl: 'https://images.unsplash.com/photo-1586190848861-99aa4a171e90?w=600&auto=format&fit=crop&q=80',
    available: true,
    prepTimeMinutes: 10,
    options: [
      { name: 'Picles Artesanal Adicional', price: 3.50 }
    ]
  },
  // Massas
  {
    id: 'item_risoto_cogumelos',
    categoryId: 'cat_massas',
    name: 'Risoto de Cogumelos Frescos & Azeite Trufado',
    description: 'Arroz arbóreo italiano, mix de shiitake, shimeji e cogumelos paris salteados no vinho branco, manteiga e parmesão Grana Padano.',
    price: 68.00,
    imageUrl: 'https://images.unsplash.com/photo-1633964913295-ceb43826e7c9?w=600&auto=format&fit=crop&q=80',
    available: true,
    prepTimeMinutes: 16,
    options: [
      { name: 'Iscas de Mignon Adicionais', price: 18.00 }
    ]
  },
  {
    id: 'item_gnocchi_ragu',
    categoryId: 'cat_massas',
    name: 'Gnocchi Artesanal ao Ragu de Costela',
    description: 'Gnocchi de batata levinho feito diariamente na casa, cozido ao molho de costela bovina desfiada marinada por 12 horas no vinho tinto.',
    price: 64.00,
    imageUrl: 'https://images.unsplash.com/photo-1551183053-bf91a1d81141?w=600&auto=format&fit=crop&q=80',
    available: true,
    prepTimeMinutes: 15,
  },
  // Bebidas
  {
    id: 'item_drink_negroni',
    categoryId: 'cat_bebidas',
    name: 'Negroni Defumado Bella Vista',
    description: 'Gin artesanal importado, Campari, Vermute tinto doce e casca de laranja bahia flambada sob cúpula de fumaça aromática de canela.',
    price: 38.00,
    imageUrl: 'https://images.unsplash.com/photo-1514362545857-3bc16c4c7d1b?w=600&auto=format&fit=crop&q=80',
    available: true,
    prepTimeMinutes: 5,
    featured: true,
  },
  {
    id: 'item_soda_italiana',
    categoryId: 'cat_bebidas',
    name: 'Soda Italiana de Frutas Vermelhas & Hortelã',
    description: 'Refrescante água gasosa com xarope francês de framboesa, amoras frescas e ramos de hortelã fresca.',
    price: 18.00,
    imageUrl: 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?w=600&auto=format&fit=crop&q=80',
    available: true,
    prepTimeMinutes: 4,
  },
  {
    id: 'item_cerveja_artesanal',
    categoryId: 'cat_bebidas',
    name: 'Cerveja IPA Artesanal (500ml)',
    description: 'Cerveja artesanal fresca com lúpulos aromáticos cítricos e amargor marcante e equilibrado.',
    price: 26.00,
    imageUrl: 'https://images.unsplash.com/photo-1608270586620-248524c67de9?w=600&auto=format&fit=crop&q=80',
    available: true,
    prepTimeMinutes: 2,
  },
  // Sobremesas
  {
    id: 'item_petit_gateau',
    categoryId: 'cat_sobremesas',
    name: 'Petit Gâteau Belga com Sorvete de Baunilha',
    description: 'Bolo quente de chocolate belga Callebaut com recheio cremoso escorrendo, servido com sorvete artesanal de fava de baunilha.',
    price: 32.00,
    imageUrl: 'https://images.unsplash.com/photo-1606313564200-e75d5e30476c?w=600&auto=format&fit=crop&q=80',
    available: true,
    prepTimeMinutes: 10,
    featured: true,
  },
  {
    id: 'item_cheesecake_frutas',
    categoryId: 'cat_sobremesas',
    name: 'Cheesecake Nova-Iorquino com Calda de Amoras',
    description: 'Base crocante de biscoito amanteigado, creme de cream cheese assado suave e generosa calda artesanal de amoras e mirtilos.',
    price: 28.00,
    imageUrl: 'https://images.unsplash.com/photo-1533134242443-d4fd215305ad?w=600&auto=format&fit=crop&q=80',
    available: true,
    prepTimeMinutes: 5,
  }
];

export const DEFAULT_TABLES: Table[] = [
  { id: 'mesa_01', tableNumber: '01', capacity: 2, status: 'available' },
  { id: 'mesa_02', tableNumber: '02', capacity: 2, status: 'available' },
  { id: 'mesa_03', tableNumber: '03', capacity: 4, status: 'available' },
  { id: 'mesa_04', tableNumber: '04', capacity: 4, status: 'available' },
  { id: 'mesa_05', tableNumber: '05', capacity: 4, status: 'available' },
  { id: 'mesa_06', tableNumber: '06', capacity: 6, status: 'available' },
  { id: 'mesa_07', tableNumber: '07', capacity: 6, status: 'available' },
  { id: 'mesa_08', tableNumber: '08', capacity: 8, status: 'available' },
  { id: 'mesa_09', tableNumber: '09', capacity: 2, status: 'available' },
  { id: 'mesa_10', tableNumber: '10', capacity: 4, status: 'available' },
];

export const DEFAULT_STAFF: StaffMember[] = [
  { id: 'staff_admin', name: 'Gerente Geral', role: 'admin', email: 'rimpressaodigitall@gmail.com', active: true, createdAt: new Date().toISOString() },
  { id: 'staff_garcom1', name: 'Carlos (Garçom Salão A)', role: 'waiter', pin: '1234', active: true, createdAt: new Date().toISOString() },
  { id: 'staff_garcom2', name: 'Juliana (Garçom Salão B)', role: 'waiter', pin: '5678', active: true, createdAt: new Date().toISOString() },
  { id: 'staff_chef', name: 'Chef Ricardo (Cozinha)', role: 'cook', pin: '9999', active: true, createdAt: new Date().toISOString() },
];

export async function seedInitialDataIfEmpty(firestore: Firestore): Promise<void> {
  try {
    const configSnap = await getDocs(collection(firestore, 'restaurant_config'));
    if (!configSnap.empty) {
      return; // Already seeded
    }

    // Seed Config
    await setDoc(doc(firestore, 'restaurant_config', 'main'), {
      ...DEFAULT_RESTAURANT_CONFIG,
      updatedAt: new Date().toISOString(),
    });

    // Seed Categories
    for (const cat of DEFAULT_CATEGORIES) {
      await setDoc(doc(firestore, 'categories', cat.id), {
        ...cat,
        updatedAt: new Date().toISOString(),
      });
    }

    // Seed Menu Items
    for (const item of DEFAULT_MENU_ITEMS) {
      await setDoc(doc(firestore, 'menu_items', item.id), {
        ...item,
        updatedAt: new Date().toISOString(),
      });
    }

    // Seed Tables
    for (const table of DEFAULT_TABLES) {
      await setDoc(doc(firestore, 'tables', table.id), {
        ...table,
        updatedAt: new Date().toISOString(),
      });
    }

    // Seed Staff
    for (const s of DEFAULT_STAFF) {
      await setDoc(doc(firestore, 'staff', s.id), s);
    }

    console.log('ComandaSmart: Initial database seed completed successfully!');
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'seedInitialData');
  }
}
