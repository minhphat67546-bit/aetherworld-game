require('dotenv').config();
const { MongoClient } = require('mongodb');

async function testConnection() {
  const uri = process.env.MONGODB_URI;
  console.log('\n🔍 Kiểm tra kết nối MongoDB...');
  console.log('📌 URI:', uri?.replace(/:([^:@]+)@/, ':***@'));
  
  try {
    const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
    await client.connect();
    await client.db().command({ ping: 1 });
    console.log('\n✅ KẾT NỐI THÀNH CÔNG!\n');
    
    const db = client.db();
    const collections = await db.listCollections().toArray();
    console.log('📦 Collections hiện có:', collections.map(c => c.name));
    
    // Test write
    await db.collection('test').insertOne({ test: true, time: new Date() });
    console.log('✅ Ghi dữ liệu thành công!');
    await db.collection('test').deleteOne({ test: true });
    console.log('✅ Xóa dữ liệu test thành công!');
    
    await client.close();
  } catch (err) {
    console.log('\n❌ KẾT NỐI THẤT BẠI!');
    console.log('Lỗi:', err.message);
    console.log('\n📋 Hướng dẫn sửa:\n');
    console.log('1. Mở MongoDB Atlas: https://cloud.mongodb.com');
    console.log('2. Tạo cluster FREE nếu chưa có');
    console.log('3. Vào Database Access → Add user (username + password)');
    console.log('4. Vào Network Access → Add IP → Allow from Anywhere (0.0.0.0/0)');
    console.log('5. Vào Cluster → Connect → Drivers → Copy connection string');
    console.log('6. Dán vào file .env:');
    console.log('   MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/aetherworld_db\n');
  }
}

testConnection();
