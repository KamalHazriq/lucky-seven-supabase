import { supabase } from './supabase'
import type { FunctionArgs, FunctionName, FunctionReturn } from './supabaseDatabase.generated'

export async function callRpc<Name extends FunctionName>(
  name: Name,
  args: FunctionArgs<Name>,
): Promise<FunctionReturn<Name>> {
  const { data, error } = await supabase.rpc(name, args as never)
  if (error) throw new Error(error.message)
  return data as FunctionReturn<Name>
}
