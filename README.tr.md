# HarborDesk

HarborDesk, Discord sunucuları için destek bileti botudur. Bir panel mesajı yayımlar, talep sahibi için özel kanal açar, en fazla 10 üyeyi bilete davet eder ve konuşma geçmişini silmeden bileti kapatır.

Bot slash komutları ve butonlarla çalışır. Normal sunucu mesajlarını okumaz, ayrıcalıklı Gateway intent'leri istemez, transcript toplamaz ve bilet içeriğini başka bir servise göndermez.

[English README](README.md) · [Güvenlik politikası](SECURITY.md) · [Katkı yönergeleri](CONTRIBUTING.md)

## Özellikler

- `/ticket-panel` ile yeniden kullanılabilir destek paneli yayımlar.
- Her üye için aynı sunucuda aynı anda tek açık bilet tutar.
- Özel kanalı yalnızca talep sahibine, destek rolüne ve HarborDesk'e açar.
- `/ticket-add` ile en fazla 10 üyeyi bilete ekler.
- `/ticket-close` ile talep sahibinin ve davetlilerin yazmasını durdurur.
- Kapanan kanalları silmez; transcript dışa aktarımı yapmaz.
- Açık bilet bilgisini Discord kanal başlığında tutar; bot yeniden başlasa da biletleri bulabilir.

## Gereksinimler

- Node.js 24.17 veya üstü.
- Bot kullanıcısı olan bir Discord uygulaması.
- Botu kurabileceğiniz bir Discord sunucusu.
- Sürekli çalışabilen bir Node.js barındırma ortamı.

## Discord uygulaması oluşturma ve davet

1. [Discord Developer Portal](https://discord.com/developers/applications) üzerinden yeni uygulama oluşturun.
2. **Bot** sayfasından bot token'ı oluşturun veya sıfırlayın. Token'ı gizli tutun ve Git'e eklemeyin.
3. **OAuth2 → URL Generator** bölümünde `bot` ve `applications.commands` kapsamlarını seçin.
4. Bot izinleri olarak **Manage Channels**, **View Channels**, **Send Messages** ve **Embed Links** seçin. İzin bit alanı `19472` olur.
5. Oluşan davet bağlantısıyla botu test sunucunuza ekleyin.

HarborDesk yalnızca `Guilds` Gateway intent'ini kullanır. Message Content, Guild Members ve Presence intent'leri gerekmez. Discord'un [slash komutları rehberinde](https://docs.discord.com/developers/docs/interactions/slash-commands) komut kaydı ve kullanım ayrıntıları bulunur.

## Kurulum ve çalıştırma

```sh
git clone https://github.com/euglado/harbordesk.git
cd harbordesk
npm ci
```

`.env.example` dosyasını `.env` olarak kopyalayıp şu değerleri girin:

```dotenv
DISCORD_TOKEN=bot-tokeniniz
DISCORD_CLIENT_ID=uygulama-kimliginiz
DISCORD_GUILD_ID=test-sunucusu-kimliginiz
```

`.env` Git tarafından yok sayılır; dosyayı paylaşmayın. Komutları test sunucusuna kaydedip botu çalıştırın:

```sh
npm run commands:register
npm start
```

Test sırasında sunucuya özel komut kaydı hızlı güncellenir. Üretim için `npm run commands:register -- --global` komutu da kullanılabilir. Discord global komut kaydında uygulamanın komut listesi bütünüyle değiştirildiği için bu komutu yalnızca özel HarborDesk uygulamasında veya tüm komutların değişmesini bilerek istediğinizde çalıştırın.

## Destek paneli kurulumu

1. Sunucuda ticket kanalı kategorisi ve destek rolü oluşturun.
2. HarborDesk'e seçtiğiniz kategoride **Manage Channels**, paneli göndereceğiniz kanalda **Send Messages** ve **Embed Links** izinlerini verin.
3. Discord'da `/ticket-panel` komutunu çalıştırıp kategori ve destek rolünü seçin.
4. Üyeler **Open a ticket** butonuna basınca `@everyone` tarafından görünmeyen özel bir kanal açılır.
5. Talep sahibi veya destek ekibi `/ticket-add` ile üye davet edebilir; çözülünce `/ticket-close` çalıştırır.

Kanal başlığı yalnızca talep sahibi, destek rolü, açık/kapalı durumu, zaman damgaları ve davet edilen üye kimliklerini tutar. Mesajlar Discord'da kalır. HarborDesk transcript oluşturmaz, mesaj dışa aktarmaz ve kapanan kanalı silmez. Saklama süresi ve sonradan silme işlemi sunucu yöneticilerinin kontrolündedir.

## Komutlar

| Komut | Kim kullanabilir | İşlev |
| --- | --- | --- |
| `/ticket-panel category support-role` | Sunucuyu Yönet izni olan üyeler | Bilet paneli yayımlar. |
| `/ticket-add member` | Bilet sahibi veya destek ekibi | Açık bilete bir üye ekler. En fazla 10 davetli. |
| `/ticket-close reason` | Bilet sahibi, destek ekibi veya kanal yöneticisi | Bilet sahibinin ve davetlilerin yazmasını durdurur. |

## İzinler ve gizlilik

Bot Administrator, Manage Roles veya moderasyon izinleri istemez. Bilet paneli komutu yalnızca Sunucuyu Yönet izniyle kullanılabilir. Bilet ekleme ve kapatma yetkileri bot içinde de doğrulanır.

Yeni kanalda `@everyone` için görünürlük kapatılır; talep sahibi, destek rolü ve bot için gerekli kanal izinleri açılır. Bot rol oluşturmaz veya üyelere rol atamaz. Mesaj içeriği okunmadığı için ayrıcalıklı Message Content intent'i gerekmez.

## Geliştirme ve testler

```sh
npm ci
npm run check
npm audit --audit-level=high
```

Testler bilet kimliği ve başlığı, yetki kuralları, açık bilet kontrolü, davetli sınırı, kanal adı ve komut yapılandırmasını kapsar. Discord token'ı veya gerçek sunucu gerektirmez. CI kontrolleri Node.js 24.17 ile çalışır.

## İşletim ve sınırlar

- Her uygulama için tek bot süreci çalıştırın. Aynı süreçte eşzamanlı açılışlar sıraya alınır; birden fazla replika koordine edilmez.
- Panelde seçilen kategori veya rol silinirse yeni bir panel yayımlayın.
- Otomatik transcript, kanal silme veya saklama süresi yönetimi yoktur; bunları sunucu yöneticileri belirler.
- Botun Discord ile sürekli bağlantı kurabilmesi için süreci çevrimiçi bir sunucuda çalıştırın.
- Token ifşa olursa Developer Portal'dan sıfırlayın.

## Lisans

HarborDesk [MIT lisansıyla](LICENSE) yayımlanır.
