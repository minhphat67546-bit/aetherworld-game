require('dotenv').config();
const { MongoClient } = require('mongodb');

async function viewData() {
  const uri = process.env.MONGODB_URI;
  console.log('🔄 Đang kết nối đến MongoDB để lấy dữ liệu...\n');
  
  try {
    const client = new MongoClient(uri);
    await client.connect();
    const db = client.db(); // mặc định lấy aetherworld_db từ .env
    
    const users = await db.collection('users').find().toArray();
    const characters = await db.collection('characters').find().toArray();
    
    console.log('=========================================');
    console.log(`👤 TÀI KHOẢN ĐÃ ĐĂNG KÝ (${users.length}):`);
    users.forEach(u => console.log(` - User: ${u.username} (Ngày tạo: ${u.createdAt})`));
    
    console.log('\n=========================================');
    console.log(`🗡️  NHÂN VẬT & TÚI ĐỒ (${characters.length}):`);
    characters.forEach(c => {
      console.log(` - Tên: ${c.name} (Cấp ${c.level} - ${c.class})`);
      console.log(`   💰 Vàng: ${c.gold}`);
      console.log(`   🎒 Đồ đạc: ${c.inventory.length} món`);
    });
    console.log('=========================================\n');
    
    await client.close();
  } catch (err) {
    console.error('❌ Không thể lấy dữ liệu. Lỗi:', err.message);
  }
}

viewData();
