// Display metadata only; authorization always uses the verified Auth user ID.
export function accountAvatar(user) {
 const choice=user?.user_metadata?.nobi_avatar;
 if(choice?.type==='preset'&&Number.isInteger(choice.id)&&choice.id>=0&&choice.id<8)return 'ui/avatar-presets/'+choice.id+'.svg';
 if(choice?.type==='upload'&&typeof choice.data==='string'&&choice.data.length<=6000&&/^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/.test(choice.data))return choice.data;
 const url=user?.user_metadata?.avatar_url??user?.user_metadata?.picture;
 return typeof url==='string'&&url.length<=2048&&/^https:\/\//.test(url)?url:null;
}
