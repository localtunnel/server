// all url safe
// can't use uppercase because hostnames are lowercased
const chars = 'abcdefghijklmnopqrstuvwxyz';

export default function rand_id() {
    let randomstring = '';
    for (var i=0; i<10; ++i) {
        const rnum = Math.floor(Math.random() * chars.length);
        randomstring += chars[rnum];
    }

    return randomstring;
}
